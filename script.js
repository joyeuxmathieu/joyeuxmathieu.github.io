import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, OAuthProvider, signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";


const firebaseConfig = {

apiKey: "AIzaSyCW2c98GzmqT0snVaKTRkm2KcZ4ndlBK7M",
authDomain: "alphark-f1982.firebaseapp.com",
projectId: "alphark-f1982"

};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);


// ===============================
// CONNEXION DISCORD
// ===============================

window.loginDiscord = function(){

const provider = new OAuthProvider('oidc.discord');

signInWithPopup(auth, provider)

.then((result)=>{

const credential = OAuthProvider.credentialFromResult(result);

const idToken = credential.idToken;

const payload = JSON.parse(atob(idToken.split('.')[1]));

const username = payload.username;


localStorage.setItem("discord_user", JSON.stringify({
username: username
}));

document.getElementById("discord-btn").style.display = "none";

document.getElementById("user-info").innerHTML =
"🟢 " + username + ' <span onclick="logout()" style="cursor:pointer;color:red;">⏻</span>';

})

.catch((error)=>{
console.log(error);
});

}


// ===============================
// DECONNEXION
// ===============================

window.logout = function(){

localStorage.removeItem("discord_user");

location.reload();

}


// ===============================
// VERIFICATION UTILISATEUR
// ===============================

document.addEventListener("DOMContentLoaded", function(){

const user = localStorage.getItem("discord_user");

if(user){

const data = JSON.parse(user);

document.getElementById("discord-btn").style.display = "none";

document.getElementById("user-info").innerHTML =
"🟢 " + data.username + ' <span onclick="logout()" style="cursor:pointer;color:red;">⏻</span>';

}

});
