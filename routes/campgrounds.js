var express     = require('express');
var router      = express.Router();
var Campground  = require('../models/campground');
var middleware  = require('../middleware');
var multer = require('multer');
var storage = multer.diskStorage({
  filename: function(req, file, callback) {
    callback(null, Date.now() + file.originalname);
  }
});
var imageFilter = function (req, file, cb) {
    // accept image files only
    if (!file.originalname.match(/\.(jpg|jpeg|png|gif)$/i)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};
var upload = multer({ storage: storage, fileFilter: imageFilter})

var cloudinary = require('cloudinary');
cloudinary.config({ 
  cloud_name: 'giacoppo', 
  api_key: process.env.CLOUDINARY_API_KEY, 
  api_secret: process.env.CLOUDINARY_API_SECRET
});

//INDEX - show all campgrounds
router.get('/', function(req, res) {
    //console.log(req.user);
    var perPage = 8;
    var pageQuery = parseInt(req.query.page);
    var pageNumber = pageQuery ? pageQuery : 1;
    var noMatch = null;
    if(req.query.search) {
        const regex = new RegExp(escapeRegex(req.query.search), 'gi');
        // Get all campgrounds from DB
        Campground.find({name: regex}).sort({createdAt: -1}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
            Campground.count({name: regex}).exec(function (err, count) {
                if(err) {
                    console.log(err);
                    res.redirect("back");
                } else {
                    if(allCampgrounds.length < 1) {
                        noMatch = 'No campgrounds match that query, please try again.';
                    }
                    res.render('campgrounds/index', {
                        campgrounds:allCampgrounds,
                        current: pageNumber,
                        pages: Math.ceil(count / perPage),
                        page: 'campgrounds', 
                        noMatch: noMatch,
                        search: req.query.search
                    });
                }
            });
        });
    } else {
        // Get all campgrounds from DB
        Campground.find({}).sort({createdAt: -1}).skip((perPage * pageNumber) - perPage).limit(perPage).exec(function (err, allCampgrounds) {
            Campground.count().exec(function (err, count) {
                if(err) {
                    console.log(err);
                } else {
                    res.render('campgrounds/index', {
                        campgrounds:allCampgrounds,
                        current: pageNumber,
                        pages: Math.ceil(count / perPage),
                        page: 'campgrounds', 
                        noMatch: noMatch,
                        search: false
                    });
                }
            });
        });
    }
});

//CREATE - add new campground to DB
router.post('/', middleware.isLoggedIn, upload.single('image'), function(req, res) {
    cloudinary.v2.uploader.upload(req.file.path, function(err, result) {
        if(err) {
            re.flash('error', err.message);
            return res.redirect('back');
        }
        // add cloudinary url for the image to the campground object under image property
        req.body.campground.image = result.secure_url;
        // add image's public_id to campground object
        req.body.campground.imageId = result.public_id;
        // add author to campground
        req.body.campground.author = {
          id: req.user._id,
          username: req.user.username,
          desc: req.user.desc
        }
        Campground.create(req.body.campground, function(err, campground) {
          if (err) {
            req.flash('error', err.message);
            return res.redirect('back');
          }
          req.flash('success', 'Campground was added');
          res.redirect('/campgrounds/' + campground.id);
        });
    });
});

//NEW - show form to create new campground
router.get('/new', middleware.isLoggedIn, function(req, res) {
    res.render('campgrounds/new');
});

//SHOW - show details for 1 campground
router.get('/:id', function(req, res) {
    //find the campground with provided ID
    Campground.findById(req.params.id).populate('comments').exec(function(err, foundCampground) {
        if(err || !foundCampground) {
            //console.log(err);
            req.flash('error', 'Campground not found');
            res.redirect('back');
        } else {
            console.log(foundCampground);
            //render show template with that campground
            res.render('campgrounds/show', {campground: foundCampground});
        }
    });
});

// EDIT CAMPGROUND ROUTE
router.get('/:id/edit', middleware.checkCampgroundOwnership, function(req, res) {
    Campground.findById(req.params.id, function(err, foundCampground) {
        res.render('campgrounds/edit', {campground: foundCampground});
    });
});

// UPDATE CAMPGROUND ROUTE
router.put('/:id', middleware.checkCampgroundOwnership, upload.single('image'), function(req, res) {
    //find and update the correct campground
    Campground.findById(req.params.id, async function(err, campground) {
        if(err) {
            req.flash('error', err.message);
            res.redirect('back');
        } else {
            if(req.file) {
                try {
                    await cloudinary.v2.uploader.destroy(campground.imageId);
                    var result = await cloudinary.v2.uploader.upload(req.file.path);
                    campground.imageId = result.public_id;
                    campground.image = result.secure_url;
                } catch(err) {
                    req.flash('error', err.message);
                    return res.redirect('back');
                }
            }
            campground.name = req.body.name;
            campground.price = req.body.price;
            campground.desc = req.body.desc;
            campground.save();
            req.flash('success', 'Successfully updated!');
            res.redirect('/campgrounds/' + campground._id);
        }
    });
    //redirect somewhere (show page)
});

// DELETE or DESTROY CAMPGROUND ROUTE
router.delete('/:id', middleware.checkCampgroundOwnership, function(req, res) {
    //res.send('YOU ARE TRYING TO DELETE SOMETHING!');
    Campground.findById(req.params.id, async function(err, campground) {
        if(err) {
            req.flash('error', err.message);
            return res.redirect('back');
        } try {
            await cloudinary.v2.uploader.destroy(campground.imageId);
            campground.remove();
            req.flash('success', 'Campground deleted successfully!');
            res.redirect('/campgrounds');
        } catch(err) {
            if(err) {
                req.flash('error', err.message);
+               res.redirect('back');
            }
        }
    });
});

function escapeRegex(text) {
    return text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&");
};

module.exports = router;