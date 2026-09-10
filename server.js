const express=require("express");
const http=require("http");
const path=require("path");
const fs=require("fs");
const crypto=require("crypto");
const session=require("express-session");
const bcrypt=require("bcryptjs");
const {Server}=require("socket.io");

const app=express(), server=http.createServer(app), io=new Server(server);
const PORT=process.env.PORT||3000;
const SECRET=process.env.SESSION_SECRET||"replace-this-secret-before-production";
const ROUND_SECONDS=30, START_BALANCE=10000;
const DATA=path.join(__dirname,"data.json");
const COLORS=["RED","GREEN","VIOLET"];

function load(){
  try{return JSON.parse(fs.readFileSync(DATA,"utf8"))}
  catch{return {users:[],predictions:[],nextUserId:1,nextPredictionId:1}}
}
let store=load();
function save(){fs.writeFileSync(DATA,JSON.stringify(store,null,2),"utf8")}
function currentRound(){return Math.floor(Date.now()/1000/ROUND_SECONDS)}
function secondsLeft(){return ROUND_SECONDS-(Math.floor(Date.now()/1000)%ROUND_SECONDS)}
function getUser(id){return store.users.find(u=>u.id===id)}
function publicUser(u){return u?{id:u.id,username:u.username,email:u.email,balance:u.balance,created_at:u.created_at}:null}
function resultFor(round){
  const h=crypto.createHash("sha256").update(`${SECRET}:${round}`).digest();
  const n=h.readUInt32BE(0)%100;
  return n<48?"GREEN":n<96?"RED":"VIOLET";
}
function auth(req,res,next){if(!req.session.userId)return res.status(401).json({error:"Login required."});next()}
function safeName(s){return /^[A-Za-z0-9_]{3,24}$/.test(s)}

app.use(express.json({limit:"20kb"}));
app.use(express.urlencoded({extended:false}));
app.use(session({
  secret:SECRET,resave:false,saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:"lax",secure:process.env.NODE_ENV==="production",maxAge:7*86400000}
}));
app.use(express.static(path.join(__dirname,"public")));

app.get("/",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));

app.post("/api/register",(req,res)=>{
  const username=String(req.body.username||"").trim();
  const email=String(req.body.email||"").trim().toLowerCase();
  const password=String(req.body.password||"");
  if(!safeName(username))return res.status(400).json({error:"Username must be 3-24 letters, numbers or underscores."});
  if(email&&!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))return res.status(400).json({error:"Enter a valid email address."});
  if(password.length<8)return res.status(400).json({error:"Password must be at least 8 characters."});
  if(store.users.some(u=>u.username.toLowerCase()===username.toLowerCase()))return res.status(409).json({error:"Username already exists."});
  if(email&&store.users.some(u=>u.email===email))return res.status(409).json({error:"Email already exists."});
  const u={id:store.nextUserId++,username,email:email||null,password_hash:bcrypt.hashSync(password,12),balance:START_BALANCE,created_at:Date.now()};
  store.users.push(u);save();req.session.userId=u.id;res.json({ok:true,user:publicUser(u)});
});

app.post("/api/login",(req,res)=>{
  const username=String(req.body.username||"").trim(),password=String(req.body.password||"");
  const u=store.users.find(x=>x.username.toLowerCase()===username.toLowerCase());
  if(!u||!bcrypt.compareSync(password,u.password_hash))return res.status(401).json({error:"Invalid username or password."});
  req.session.userId=u.id;res.json({ok:true,user:publicUser(u)});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/me",(req,res)=>{
  const u=req.session.userId&&getUser(req.session.userId);
  res.json(u?{authenticated:true,user:publicUser(u)}:{authenticated:false});
});
app.get("/api/round",(req,res)=>res.json({round:currentRound(),seconds:secondsLeft(),previousResult:resultFor(currentRound()-1)}));

app.post("/api/predict",auth,(req,res)=>{
  const color=String(req.body.color||"").toUpperCase(),stake=Math.floor(Number(req.body.stake));
  if(!COLORS.includes(color))return res.status(400).json({error:"Select RED, GREEN or VIOLET."});
  if(!Number.isFinite(stake)||stake<10||stake>5000)return res.status(400).json({error:"Stake must be between 10 and 5,000 virtual points."});
  if(secondsLeft()<=2)return res.status(409).json({error:"Round is closing. Try the next round."});
  const u=getUser(req.session.userId),round=currentRound();
  if(u.balance<stake)return res.status(400).json({error:"Insufficient virtual points."});
  if(store.predictions.some(p=>p.user_id===u.id&&p.round_id===round))return res.status(409).json({error:"You already predicted this round."});
  u.balance-=stake;
  store.predictions.push({id:store.nextPredictionId++,user_id:u.id,round_id:round,color,stake,result:null,payout:0,created_at:Date.now()});
  save();res.json({ok:true,round,color,stake,balance:u.balance});
});

app.get("/api/history",auth,(req,res)=>res.json({
  items:store.predictions.filter(p=>p.user_id===req.session.userId).sort((a,b)=>b.id-a.id).slice(0,50)
}));
app.get("/api/leaderboard",(req,res)=>res.json({
  items:[...store.users].sort((a,b)=>b.balance-a.balance||a.username.localeCompare(b.username)).slice(0,20).map(publicUser)
}));

function settle(round){
  const outcome=resultFor(round);
  for(const p of store.predictions.filter(x=>x.round_id===round)){
    p.result=outcome;p.payout=p.color===outcome?p.stake*(outcome==="VIOLET"?4:2):0;
    if(p.payout)getUser(p.user_id).balance+=p.payout;
  }
  save();return outcome;
}
let observed=currentRound();
setInterval(()=>{
  const r=currentRound();
  if(r!==observed){
    const outcome=settle(observed);
    io.emit("result",{round:observed,color:outcome});
    observed=r;
  }
  io.emit("tick",{round:r,seconds:secondsLeft(),online:io.engine.clientsCount,previousResult:resultFor(r-1)});
},250);

io.on("connection",socket=>{
  socket.emit("tick",{round:currentRound(),seconds:secondsLeft(),online:io.engine.clientsCount,previousResult:resultFor(currentRound()-1)});
});

server.listen(PORT,()=>console.log(`Colour Prediction Arena running on http://localhost:${PORT}`));
