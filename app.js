//jshint esversion:6
require('dotenv').config();
const bodyParser = require('body-parser');
const express = require('express');
const ejs = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const passportLocalMongoose = require('passport-local-mongoose');
var GoogleStrategy = require('passport-google-oauth20').Strategy;
var FacebookStrategy = require('passport-facebook').Strategy;
const findOrCreate = require('mongoose-findorcreate');

const date = require(__dirname + "/date.js");

var flash = require("connect-flash");


// const encrypt = require('mongoose-encryption');
// const md5 = require('md5');

// const bcrypt = require('bcrypt');
// const saltRounds = 10;






// userSchema.plugin(encrypt, {secret: process.env.SECRET, encryptedFields: ['password'] });



const app = express();

app.use(flash());

app.use(express.static('public'));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));

app.use(session({
    secret: 'Our little secret.',
    resave: false,
    saveUninitialized: false
}));

app.use(passport.initialize());
app.use(passport.session());

// const uri = "mongodb://127.0.0.1:27017/userDB";
const uri = "mongodb+srv://Ken_oshimoto:" + process.env.MONGO_PW + "@cluster0.i7qdtbw.mongodb.net/userDB";
mongoose.set("strictQuery", false);
mongoose.connect(uri);


const postSchema = new mongoose.Schema({
    dateAndTime: String,
    post: String
});

const Post = new mongoose.model("post", postSchema);


const userSchema = new mongoose.Schema({
    username: String,
    password: String,
    googleId: String,
    facebookId: String,
    secrets: [postSchema]
});






userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);

const User = new mongoose.model("User", userSchema);

passport.use(User.createStrategy());

passport.serializeUser(function(user, cb) {
    process.nextTick(function() {
      cb(null, { id: user.id, username: user.username, name: user.name });
    });
  });
   
  passport.deserializeUser(function(user, cb) {
    process.nextTick(function() {
      return cb(null, user);
    });
  });

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo" //! From GitHub Issues because of G+ Deprecation 
},
    function (accessToken, refreshToken, profile, cb) {
        User.findOrCreate({ googleId: profile.id }, function (err, user) {
            return cb(err, user);
        });
    }
));

passport.use(new FacebookStrategy({
    clientID: process.env.FB_ID,
    clientSecret: process.env.FB_SECRET,
    callbackURL: "http://localhost:3000/auth/facebook/callback"
  },
  function(accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id }, function (err, user) {
      return cb(err, user);
    });
  }
));

app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function(req, res) {
    // Successful authentication, redirect home.
    res.redirect('/secrets');
  });

app.get("/", (req, res) => {
    res.render("home");
});

app.get("/auth/google", passport.authenticate("google", { scope: ['profile', 'email', 'openid'] }));

app.get('/auth/google/secrets',
    passport.authenticate('google', {
        successRedirect: '/secrets',
        failureRedirect: '/login'
}));
app.get("/login", (req, res) => {
    const message = req.flash("error");
    res.render("login", { error: message });
});
let pwError = "";

app.get("/register", (req, res) => {
    res.render('register', { error: pwError });
    pwError = "";
});
app.get("/secrets", function (req, res) {
    const secretPosts = [];
    User.find({'secrets': {$ne: null}}, function(err, foundUsers){
        if(err){
            console.log(err);
        }else{
            if(foundUsers){
                foundUsers.forEach(user => {
                    if(user.secrets){
                        var usersecrets =  user.secrets;
                        usersecrets.forEach(secret=>{
                            secretPosts.push(secret);
                        });
                    }
                    
                });
                console.log( secretPosts );
               secretPosts.sort(function(a, b) {
                    const dateA = new Date(a.dateAndTime);
                    const dateB = new Date(b.dateAndTime);
                    return dateB - dateA;
                });
                  console.log( secretPosts );
                res.render("secrets", {usersSecrets: secretPosts.slice(0,9), loggedin: req.isAuthenticated()});
                
            }
        }
    });
   
  
});

app.get("/submit", (req, res)=>{
    if (req.isAuthenticated()) {
        res.render("submit");
    } else {
        res.redirect("/login");
    }
});

app.post("/submit", (req, res)=>{
    const submittedSecret = req.body.secret;
    const day = date.getDate();

    User.findById(req.user.id, (err, foundUser)=>{
        if(err){
            console.log(err);
        }else{
            if(foundUser){
                const newpost = new Post({
                    dateAndTime: day,
                    post: submittedSecret
                });
                foundUser.secrets.push(newpost);
                foundUser.save(function(){
                    res.redirect("/secrets");
                });
            }
        }
    });
    
});

app.get("/logout", function (req, res) {

    req.logout(function(err) {
        if (err) { return next(err); }
        res.redirect('/');
    });
    
});

app.post("/register", (req, res) => {

    

    if(req.body.password === req.body.passwordConfirm){
        User.register({ username: req.body.username }, req.body.password, function (err, user) {
            if (err) {
                console.log(err);
                pwError = 'Error!';
                res.redirect("/register");
            } else {
                passport.authenticate("local")(req, res, function () {
                    res.redirect("/secrets");
                });
            }
        });


    }else{
        pwError = 'Passwords do not match!';
        res.redirect("/register");     
    }

});

app.post("/login", passport.authenticate("local", {

    successRedirect: "/secrets",

    failureRedirect: "/login",
    successFlash: true,
    failureFlash: true,
    successFlash: 'successful',
    failureFlash: 'Invalid username or password.'

}));


app.get("/:usersecrets", function(req,res) {
 
    const requestedUrl = req.params.usersecrets;
    User.findOne({'_id': requestedUrl},(err, foundUser)=>{
      if (!err) {
        const userposts = foundUser.secrets;
        userposts.sort(function(a,b){return new Date(b.dateAndTime) - new Date(a.dateAndTime)});
        res.render("account", {usersSecrets: userposts, loggedin: req.isAuthenticated()});
      } 
      else{
        res.redirect('/');
      }
      
      
    });
  });


app.post("/account", function(req,res){
    if(req.isAuthenticated){
        res.redirect("/" + req.user.id);
    }else{
        res.redirect("/");
    }
   
});

app.post("/delete", function(req,res){
    User.updateOne({_id: req.user.id},{$pull: {secrets: {_id: req.body.secretpost}}},(err,foundPosts) =>{
        if(!err){
            res.redirect("/" + req.user.id);
        }
    });

    console.log(req.body.secretpost);
});

// app.post("/login", (req, res) => {


//     const user = new User({
//         username : req.body.username,
//         password : req.body.password
//     });

//     req.login(user, function(err){
//         if(err){
//             console.log(err);
//             loginError = "Error!";
//             res.redirect("/login");
//         }else{
//             passport.authenticate("local")(req, res, function(){
//                 res.redirect("/secrets");
//             });
//         }
//     });
// const username = req.body.username;
// const password = req.body.password;
// User.findOne({ email: username }, function (err, foundUser) {
//     if (err) {
//         console.log(err);
//         loginError = "That Email does not match our records!";
//         res.redirect("/login");
//     } else {
//         if (foundUser) {
//             bcrypt.compare(password, foundUser.password, (err, result) => {
//                 if (result === true) {
//                     res.render("secrets");
//                 } else {
//                     loginError = "Password does not match our records!";
//                     res.redirect("/login");
//                 }
//             });
//         }
//     }
// });
// });
const port = process.env.PORT||3000;

app.listen(port, () => {
    console.log(`server started on port ${port}`);
});
