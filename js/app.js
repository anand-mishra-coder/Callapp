import { initializeApp } from "https://www.gstatic.com/firebasejs/12.16.0/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-auth.js";
import {
  getFirestore, collection, doc, setDoc, getDoc, updateDoc, addDoc,
  onSnapshot, query, where, orderBy, serverTimestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.16.0/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const google = new GoogleAuthProvider();

const $ = id => document.getElementById(id);
const loginScreen = $("loginScreen"), appScreen = $("appScreen");
let currentUser = null, users = [], unsubscribeUsers = null, unsubscribeCalls = null;
let activeCall = null, incomingCall = null, pc = null, localStream = null, remoteStream = null;
let muted = false, videoEnabled = true, heartbeatTimer = null, candidateUnsubs = [];

function toast(msg){
  const el=$("toast"); el.textContent=msg; el.classList.add("show");
  setTimeout(()=>el.classList.remove("show"),2800);
}
function escapeText(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function avatar(u){return u.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(u.displayName||"User")}&background=111827&color=fff`;}

$("googleBtn").onclick = async()=>{
  try{ await signInWithPopup(auth,google); }catch(e){ console.error(e); toast(e.message || "Google sign-in failed"); }
};
$("signOutBtn").onclick = ()=>signOut(auth);

onAuthStateChanged(auth, async user=>{
  if(!user){
    currentUser=null; appScreen.classList.add("hidden"); loginScreen.classList.remove("hidden");
    cleanupRealtime(); return;
  }
  currentUser=user;
  loginScreen.classList.add("hidden"); appScreen.classList.remove("hidden");
  $("myName").textContent=user.displayName||"Google User";
  $("myEmail").textContent=user.email||"";
  $("myPhoto").src=avatar(user);
  await upsertProfile();
  subscribeUsers();
  subscribeIncomingCalls();
  startHeartbeat();
});

async function upsertProfile(){
  const ref=doc(db,"users",currentUser.uid);
  const old=await getDoc(ref);
  await setDoc(ref,{
    uid:currentUser.uid, displayName:currentUser.displayName||"Google User",
    email:currentUser.email||"", photoURL:currentUser.photoURL||"",
    online:true, lastSeen:serverTimestamp(),
    createdAt:old.exists()?old.data().createdAt:serverTimestamp()
  },{merge:true});
}
function startHeartbeat(){
  clearInterval(heartbeatTimer);
  heartbeatTimer=setInterval(async()=>{
    if(currentUser) await updateDoc(doc(db,"users",currentUser.uid),{online:true,lastSeen:serverTimestamp()}).catch(()=>{});
  },20000);
  window.addEventListener("beforeunload",()=>updateDoc(doc(db,"users",currentUser.uid),{online:false,lastSeen:serverTimestamp()}).catch(()=>{}),{once:true});
}
function cleanupRealtime(){
  if(unsubscribeUsers) unsubscribeUsers();
  if(unsubscribeCalls) unsubscribeCalls();
  clearInterval(heartbeatTimer);
}
function subscribeUsers(){
  if(unsubscribeUsers) unsubscribeUsers();
  unsubscribeUsers=onSnapshot(query(collection(db,"users"),orderBy("displayName")),snap=>{
    users=snap.docs.map(d=>d.data()).filter(u=>u.uid!==currentUser.uid);
    renderUsers();
  },err=>{console.error(err);toast("Could not load users. Check Firestore rules.");});
}
function renderUsers(){
  const term=($("searchInput").value||"").toLowerCase().trim();
  const filtered=users.filter(u=>(u.displayName||"").toLowerCase().includes(term)||(u.email||"").toLowerCase().includes(term));
  $("onlineCount").textContent=`${users.filter(u=>u.online).length} online`;
  $("peopleList").innerHTML=filtered.map(u=>`
    <div class="person">
      <img src="${avatar(u)}" alt="">
      <div class="person-main">
        <strong>${escapeText(u.displayName)}</strong>
        <small>${escapeText(u.email)}</small>
        <small class="status ${u.online?'online':'offline'}">● ${u.online?'Online':'Offline'}</small>
      </div>
      <div class="person-actions">
        <button class="mini" title="Audio call" data-audio="${u.uid}">☎</button>
        <button class="mini" title="Video call" data-video="${u.uid}">▣</button>
      </div>
    </div>`).join("") || `<p style="color:#9ca3af">No other signed-in users found.</p>`;
  document.querySelectorAll("[data-audio]").forEach(b=>b.onclick=()=>startCall(findUser(b.dataset.audio),false));
  document.querySelectorAll("[data-video]").forEach(b=>b.onclick=()=>startCall(findUser(b.dataset.video),true));
}
$("searchInput").oninput=renderUsers;
function findUser(uid){return users.find(u=>u.uid===uid);}

function subscribeIncomingCalls(){
  if(unsubscribeCalls) unsubscribeCalls();
  const q=query(collection(db,"calls"),where("calleeId","==",currentUser.uid),where("status","==","ringing"));
  unsubscribeCalls=onSnapshot(q,snap=>{
    const docSnap=snap.docs[0];
    if(docSnap && !activeCall) showIncoming({id:docSnap.id,...docSnap.data()});
  });
}
function showIncoming(call){
  incomingCall=call;
  $("incomingPhoto").src=avatar({displayName:call.callerName,photoURL:call.callerPhoto});
  $("incomingName").textContent=call.callerName||"Incoming call";
  $("incomingEmail").textContent=call.callerEmail||"";
  $("incomingType").textContent=call.type==="video"?"Incoming video call":"Incoming audio call";
  $("incomingModal").classList.remove("hidden");
}
$("rejectBtn").onclick=async()=>{
  if(!incomingCall)return;
  await updateDoc(doc(db,"calls",incomingCall.id),{status:"rejected",endedAt:serverTimestamp()}).catch(()=>{});
  $("incomingModal").classList.add("hidden"); incomingCall=null;
};
$("acceptBtn").onclick=async()=>{
  if(!incomingCall)return;
  const call=incomingCall; incomingCall=null;
  $("incomingModal").classList.add("hidden");
  await acceptCall(call);
};

const rtcConfig={iceServers:[
  {urls:"stun:stun.l.google.com:19302"},
  {urls:"stun:stun1.l.google.com:19302"}
]};

async function createPeer(callId,isCaller){
  pc=new RTCPeerConnection(rtcConfig);
  remoteStream=new MediaStream(); $("remoteVideo").srcObject=remoteStream;
  pc.ontrack=e=>{e.streams[0]?.getTracks().forEach(t=>remoteStream.addTrack(t)); $("remotePlaceholder").classList.add("hidden");};
  pc.onicecandidate=async e=>{
    if(!e.candidate)return;
    await addDoc(collection(db,"calls",callId,isCaller?"callerCandidates":"calleeCandidates"),e.candidate.toJSON());
  };
  pc.onconnectionstatechange=()=>{
    $("callStatus").textContent=pc.connectionState;
    if(["failed","disconnected","closed"].includes(pc.connectionState)) setTimeout(()=>endCall(false),800);
  };
  return pc;
}
async function listenCandidates(callId,isCaller){
  const col=isCaller?"calleeCandidates":"callerCandidates";
  const unsub=onSnapshot(collection(db,"calls",callId,col),snap=>{
    snap.docChanges().forEach(async ch=>{
      if(ch.type==="added" && pc) try{await pc.addIceCandidate(ch.doc.data())}catch(e){console.warn(e)}
    });
  });
  candidateUnsubs.push(unsub);
}
async function getMedia(video){
  return navigator.mediaDevices.getUserMedia({audio:true,video:video?{facingMode:"user"}:false});
}
async function startCall(target,video){
  if(!target)return;
  if(target.online===false) toast("This user appears offline, but you can still try calling.");
  try{
    localStream=await getMedia(video);
    activeCall={target, type:video?"video":"audio", isCaller:true};
    $("callName").textContent=target.displayName||target.email;
    $("callStatus").textContent="Calling…";
    $("callModal").classList.remove("hidden");
    $("localVideo").srcObject=localStream;
    $("localVideo").style.display=video?"block":"none";
    videoEnabled=video;
    await createPeerAndOffer();
  }catch(e){console.error(e);toast("Camera/microphone permission was denied or unavailable.");cleanupMedia();}
}
async function createPeerAndOffer(){
  const c=await addDoc(collection(db,"calls"),{
    callerId:currentUser.uid,callerName:currentUser.displayName||"Google User",
    callerEmail:currentUser.email||"",callerPhoto:currentUser.photoURL||"",
    calleeId:activeCall.target.uid,calleeName:activeCall.target.displayName||"",
    calleeEmail:activeCall.target.email||"",type:activeCall.type,status:"ringing",createdAt:serverTimestamp()
  });
  activeCall.id=c.id;
  await createPeer(c.id,true);
  localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
  const offer=await pc.createOffer(); await pc.setLocalDescription(offer);
  await updateDoc(c,{offer:{type:offer.type,sdp:offer.sdp}});
  await listenCandidates(c.id,true);
  onSnapshot(c,snap=>{
    const d=snap.data(); if(!d||!activeCall)return;
    if(d.answer && !pc.currentRemoteDescription) pc.setRemoteDescription(d.answer).catch(console.error);
    if(d.status==="rejected") {toast("Call declined");endCall(false);}
    if(d.status==="ended") endCall(false);
  });
}
async function acceptCall(call){
  try{
    localStream=await getMedia(call.type==="video");
    activeCall={id:call.id,target:{uid:call.callerId,displayName:call.callerName,email:call.callerEmail,photoURL:call.callerPhoto},type:call.type,isCaller:false};
    $("callName").textContent=call.callerName||call.callerEmail;
    $("callStatus").textContent="Connecting…";
    $("callModal").classList.remove("hidden");
    $("localVideo").srcObject=localStream;
    $("localVideo").style.display=call.type==="video"?"block":"none";
    await createPeer(call.id,false);
    localStream.getTracks().forEach(t=>pc.addTrack(t,localStream));
    await pc.setRemoteDescription(call.offer);
    const answer=await pc.createAnswer(); await pc.setLocalDescription(answer);
    await updateDoc(doc(db,"calls",call.id),{answer:{type:answer.type,sdp:answer.sdp},status:"accepted"});
    await listenCandidates(call.id,false);
    onSnapshot(doc(db,"calls",call.id),snap=>{if(snap.data()?.status==="ended")endCall(false)});
  }catch(e){console.error(e);toast("Could not accept call.");await updateDoc(doc(db,"calls",call.id),{status:"ended"}).catch(()=>{});cleanupMedia();}
}
$("hangupBtn").onclick=()=>endCall(true);
async function endCall(notify=true){
  const callId=activeCall?.id;
  if(notify&&callId) await updateDoc(doc(db,"calls",callId),{status:"ended",endedAt:serverTimestamp()}).catch(()=>{});
  candidateUnsubs.forEach(u=>u());candidateUnsubs=[];
  if(pc){pc.close();pc=null}
  cleanupMedia();activeCall=null;
  $("callModal").classList.add("hidden");
}
function cleanupMedia(){
  if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null}
  if($("localVideo"))$("localVideo").srcObject=null;
  if($("remoteVideo"))$("remoteVideo").srcObject=null;
}
$("muteBtn").onclick=()=>{
  muted=!muted;
  localStream?.getAudioTracks().forEach(t=>t.enabled=!muted);
  $("muteBtn").textContent=muted?"Unmute":"Mic";
};
$("videoBtn").onclick=()=>{
  if(!localStream)return;
  const track=localStream.getVideoTracks()[0];
  if(!track){toast("This is an audio-only call.");return}
  videoEnabled=!videoEnabled; track.enabled=videoEnabled; $("videoBtn").textContent=videoEnabled?"Video":"Camera off";
};
$("speakerBtn").onclick=()=>{
  const v=$("remoteVideo"); v.muted=!v.muted; $("speakerBtn").textContent=v.muted?"Speaker off":"Speaker";
};
