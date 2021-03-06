var express = require('express');
var app = express();
app.set('view engine', 'ejs');
var bodyParser = require('body-parser');
const passport = require('passport');
const db = require("./models");
const localStrategy = require("passport-local").Strategy;
// const jwt = require("jsonwebtoken");
const async = require('async');
// const crypto = require('crypto');
const AuthController = {};
const config = require('./config');


var cors = require('cors');
app.use(cors());
let http = require('http');
let server = http.createServer(app);
let socketIO = require('socket.io');
let path = require('path');
var likeRoute = require('./routes/likes');
var playlistRoute = require('./routes/playlist');
let io = socketIO(server);
app.set('io', io);
io.on('connection', (socket) => {
    console.log('user connected');
});

passport.use(new localStrategy(db.user.authenticate()));
passport.serializeUser(db.user.serializeUser());
passport.deserializeUser(db.user.deserializeUser());


//use static files
app.use(express.static(__dirname + '/views'));
app.use(express.static(__dirname + '/public'));

app.use(require('express-session')({
    secret: 'Tmx8Y=fEn!A2KF=5cU2#&UaHMJweeUcTSWN5-6pXTUEHpu?Yhv',
    resave: false,
    saveUninitialized: false
}));



//secret code password = 'Tmx8Y=fEn!A2KF=5cU2#&UaHMJweeUcTSWN5-6pXTUEHpu?Yhv';

app.use(passport.initialize());
app.use(passport.session());

app.use(express.static(__dirname + '/public'));

// use body parser
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/api/like', likeRoute);
app.use('/api/playlist', playlistRoute);

var line = __dirname + '/views'
app.use(express.static(line))

// root route
app.get('/', (req, res) => {
    db.song.find().then(songs => {
        res.render('index', { songs: songs });
    }).catch(err => {
        res.render('index', { songs: {} });
    })
});

app.get('/signup', (req, res) => {
    res.render('signup', { msg: '' });
});

// Request a song
app.get('/request', (req, res) => {
    res.render('request');
});

app.post('/request', (req, res) => {
    db.request.create(req.body).then(req => {
        res.redirect('/');
    })
})

//user signup
app.post("/signup", (req, res) => {
    if (!req.body.username || !req.body.password) {
        res.redirect('/signup');
    }
    db.user.register(
        new db.user({
            username: req.body.username
        }),
        req.body.password,
        (err, user) => {
            if (err) {
                return res.render('signup', { msg: err });
            }
            passport.authenticate("local")(req, res, () => {
                res.redirect('/upload');
            })
        }
    );
});

app.get('/music/:id', (req, res) => {
    db.song.findById(req.params.id).then(song => {
        song.views = song.views + 1;
        song.save().then(() => {
            io.emit('newview');
        });
        res.render('music', { song: song });
    });
});

app.get('/login', (req, res) => {
    res.render('login');
});

//user login
app.post('/login', (req, res, next) => {
    AuthController.login(req, res, next); //Holds the properties in an object before sending the parameters
});
AuthController.login = async (req, res) => {
    //try and catch error to determine look out before and after getting the authentication.
    try {
        if (!req.body.username || !req.body.password) {
            res.redirect('/login');
        }
        passport.authenticate('local', { session: false }, (err, user) => {
            if (err || !user) {
                res.redirect('/login');
            }
            req.login(user, { session: true }, (err) => {
                if (err) {
                    res.send(err);
                }
                res.redirect('/upload');
            });
        })(req, res);
    }
    catch (err) {
        console.log(err);
    }
};

app.get('/upload', isLoggedIn, (req, res) => {
    res.render('upload');
});

// upload image
const multer = require('multer');

// set storage engine
const storage = multer.diskStorage({
    destination: 'public/uploads/',
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

// initialize upload
const upload = multer({
    storage: storage,
    limits: { fileSize: 5000000 },
    fileFilter: function (req, file, cb) {
        checkFileType(file, cb);
    }
}).single('song');

//check file type
function checkFileType(file, cb) {
    const fileTypes = /mp3|m4a|oga|mp4/;
    const extname = fileTypes.test(path.extname(file.originalname).toLowerCase());

    const mimeType = fileTypes.test(file.mimetype)

    if (mimeType && extname) {
        return cb(null, true);
    } else {
        cb('Error:Images Only!');
    }
}

app.post('/upload', isLoggedIn, (req, res) => {
    upload(req, res, (err) => {
        if (err) {
            res.redirect('/upload');
        } else {
            var song = '/uploads/' + req.file.filename
            db.song.create({
                username: req.body.name,
                title: req.body.title,
                genres: req.body.genres.split(','),
                short_description: req.body.short_description,
                long_description: req.body.long_description,
                song: song
            }).then(song => {
                res.redirect('/music/' + song._id)
            });
            // res.send({ statusText: 'Uploaded Successfully', statusCode: 200 });
        }
    })
});

app.get('/playlists', (req, res) => {
    db.playlist.find().then(playlists => {
        res.render('playlist', { playlists: playlists });
    });
});

app.get('/shareplaylist', (req, res) => {
    res.render('shareplaylist');
});

app.post('/shareplaylist', (req, res) => {
    db.playlist.create({
        username: req.body.name,
        short_description: req.body.short_description,
        long_description: req.body.long_description
    }).then(playlist => {
        res.redirect('/playlist/' + playlist._id);
    });
});

app.get('/playlist/:id', (req, res) => {
    db.playlist.findById(req.params.id).then(playlist => {
        res.render('singleplaylist', { playlist: playlist });
    });
});

app.get('/artists', (req, res) => {
    db.user.find({ artist: true }).then(artists => {
        res.render('artists', { artists: artists });
    });
});

app.get('/artist/:id', (req, res) => {
    db.user.findOne({ username: req.params.id }).then(artist => {
        db.song.find({ username: artist.username }).then(songs => {
            res.render('artist', { artist: artist, songs: songs });
        });
    });
});

app.get('/register-artist', (req, res) => {
    res.render('register')
});

app.post('/register', (req, res) => {
    if (!req.body.username || !req.body.password) {
        res.redirect('/signup');
    } else {
        db.user.register(
            new db.user({
                username: req.body.username,
                stage_name: req.body.username,
                short_description: req.body.short_description,
                artist: true,
                catch_phrase: req.body.catch_phrase,
                full_name: req.body.full_name
            }),
            req.body.password,
            (err, user) => {
                if (err) {
                    return res.redirect('/register');
                }
                passport.authenticate("local")(req, res, () => {
                    res.redirect('/artist/' + req.body.username);
                });
            }
        );
    }
})

function isLoggedIn(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.redirect('/signup');
}


app.get('/songs', (req, res) => {
    db.song.find().then(songs => {
        res.render('songs', { songs: songs });
    });
});


//listen 
server.listen(config.port, () => {
    console.log(`listening at port ${config.port} on ${config.envName} server`);
});