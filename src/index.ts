import { app } from "./server";
import { initializeApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDz1gmfYWryGMken3i1bVfNQP2tha3vIi8",
  authDomain: "usernamegenerator.firebaseapp.com",
  projectId: "usernamegenerator",
  storageBucket: "usernamegenerator.appspot.com",
  messagingSenderId: "853416854561",
  appId: "1:853416854561:web:ce4ad92e0ba115925e8f60",
};

// Initialize Firebase
const firebase = initializeApp(firebaseConfig);


// app.listen(3000, () => {
//   console.log("running username generator");
// });
