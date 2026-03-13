// =================================
// VERIFICATION UTILISATEUR
// =================================

document.addEventListener("DOMContentLoaded", function(){

const user = localStorage.getItem("discord_user")

if(user){

const data = JSON.parse(user)

document.getElementById("discord-btn").style.display = "none"

document.getElementById("user-info").innerHTML =
"🟢 " + data.username + ' <span onclick="logout()" style="cursor:pointer;color:red;">⏻</span>'

}

})



// =================================
// CONNEXION DISCORD
// =================================

function loginDiscord(){

// simulation connexion
// (firebase ou discord oauth sera branché ici)

const pseudo = prompt("Entre ton pseudo Discord")

if(!pseudo) return

const user = {
username:pseudo
}

localStorage.setItem("discord_user",JSON.stringify(user))

location.reload()

}



// =================================
// DECONNEXION
// =================================

function logout(){

localStorage.removeItem("discord_user")

location.reload()

}
