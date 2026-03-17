import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, OAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
apiKey: "AIzaSyCW2c98GzmqT0snVaKTRkm2KcZ4ndlBK7M",
authDomain: "alphark-f1982.firebaseapp.com",
projectId: "alphark-f1982"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const btn = document.getElementById("discord-btn");
const userInfo = document.getElementById("user-info");

// ===============================
// UTILISATEUR SAUVEGARDE
// ===============================

const savedUser = localStorage.getItem("discord_user");

if(savedUser){
const data = JSON.parse(savedUser);
showUser(data.username,data.avatar);
}

// ===============================
// CONNEXION DISCORD
// ===============================

btn.addEventListener("click", loginDiscord);

function loginDiscord(){

const provider = new OAuthProvider('oidc.discord');

signInWithPopup(auth, provider)

.then((result)=>{

const credential = OAuthProvider.credentialFromResult(result);
const idToken = credential.idToken;

// decode token
const payload = JSON.parse(atob(idToken.split('.')[1]));

console.log("DISCORD DATA :", payload); // 🔥 debug

const username = payload.preferred_username || payload.username || "Joueur";
const avatar = payload.picture || null;

// si avatar existe
let avatarURL = "";

if(avatar){
avatarURL = avatar;
}else{
avatarURL = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
}

// sauvegarde
localStorage.setItem("discord_user", JSON.stringify({
username: username,
avatar: avatarURL
}));

showUser(username, avatarURL);

})

.catch((error)=>{
console.log("Erreur Discord :", error);
});

}
// ===============================
// AFFICHER UTILISATEUR
// ===============================

function showUser(username, avatar){

btn.style.display="none";

userInfo.innerHTML = `
<img src="${avatar}" class="avatar">
🟢 ${username}
<span onclick="logout()" style="cursor:pointer;color:red;margin-left:8px;">⏻</span>
`;

}
function showUser(username, avatar){

btn.style.display="none";

userInfo.innerHTML = `
<img src="${avatar}" class="avatar">
🟢 ${username}
<span onclick="logout()" style="cursor:pointer;color:red;margin-left:8px;">⏻</span>
`;

