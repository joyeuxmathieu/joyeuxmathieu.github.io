// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyCw2c98GzmqT0snVaKTrkm2Kcz4ndlBK7M",
  authDomain: "alphark-f1982.firebaseapp.com",
  projectId: "alphark-f1982",
  storageBucket: "alphark-f1982.appspot.com",
  messagingSenderId: "120277911559",
  appId: "1:120277911559:web:20a6823b44eda2e07082a2"
};

// Initialisation
firebase.initializeApp(firebaseConfig);

// Activation Auth
const auth = firebase.auth();
