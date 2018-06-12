var express = require("express");
var router = express.Router();
var http = require('http');
var fs = require('fs');
var bodyParser = require('body-parser');
//var nodemailer = require('nodemailer');



var webRoot = "./src";
var port = 8080;

var players = null;
var config = null;
var bracket = null;




var transporter = null;

var endPhrases = new Array(
	//"I think I have been hacked.  Those can't possibly be your choices.  Someone must really wants to put a joke on you to submit these to your name!",
	//"I am looking at these choices and I cannot stop laughing!!!",
	//"Maybe next year you should enroll in a golf Pickem!!",
	//"Well that 10$ did not last long...  Maybe next year...",
	"You can change these picks until Thursday 18:30.  I strongly recommend that you do!",
	"Mppffffftttt, mppffffftttt, mppffffftttt  POUHAHAHAHAHAHAAHA!!!!!  Those are f-u-n-n-y!!!!!\nThank you for that, my day was boring so far.",
	"Are you picking your teams because you like their shirt color?  Sure looks like it...",
	"Reminder, the goal of this game is to finish on top.  Looking at your picks, I figured you didn't know that.",
	//"You could at least make the effort of looking at the screen while making your picks!",
	//"I hope you at least have a great personality...",
	//"If your place in society was based based on these choices, you would have to go to jail.  These are a crime against hockey!!!!!!",
	//"Up until now the worst decision in gambling history was made by Pete Rose, you sadly beat him by a long stretch!",
	//"Maybe I should make an 'Insta-pick' feature just for you...",
	//"Geeeeeese... If you don't want to play anymore, just quit!",
	//"You are lucky my 'Rejected for stupidity' feature is not yet implemented.",
	//"Here's a New Year resolution for you: I will stop making bad football picks in 2018!",
	//"I hope you asked for some Football Wisdom for Christmas!",
	//"Luckily for you, the season ending is close!",
	"Based on these choices, I wouldn't watch TV all week if I were you..."

);

var endPhrasesPerso = [

];


//A sample GET request    
router.route("/stats").get(function(req, res) {
	debug("Got a GET request");
    res.send(fs.readFileSync("results.json", "utf8"));
});    

//A sample POST request
router.route("/results").post(function(req, res, next) {
	debug("Got POST Data " + req.body);
	fs.appendFile("./results.json",
                ",\n" + req.body, 
                "utf8",
				errorProcessing);
   res.send('Got Post Data');
   next();
   
});

var app = express();
app.use(bodyParser.text());
app.use(bodyParser.json());
app.use('/',router);
app.use('/',express.static(webRoot));

var errorProcessing = function(err)
{
	if (err) 
	{
		throw err;
	}
	else
	{
		debug('The "data to append" was appended to file!');
	}
}

var expressServer = app.listen(port,function()
{
	debug("Parsing Players File");
	var playersString = fs.readFileSync("playerEntries.json");
	players = JSON.parse(playersString);
	// Verify that the admin info is present
	if (players[0].name != "admin" || players[0].password == undefined)
	{
		debug("Invalid password file, admin info not present");
		process.exit(1);
	}
	debug("Parsing config");
	var configString = fs.readFileSync("config.json");
	config = JSON.parse(configString);
	debug("Parsing the bracket");
	var bracketString = fs.readFileSync("bracket.json");
	bracket = JSON.parse(bracketString);
	debug("Express Started");
});

router.route("/logininfo/:type/:arg1").get(function(req, res, next) 															 
{
	debug("GET Login Info");
	var playerNames = new Array();
	for(var i=1; i < players.length; i++)
	{
		playerNames.push(players[i].name);
	}
    res.send(JSON.stringify(playerNames, null, 2));
});

router.route("/logininfo/:username/:password").post(function(req, res, next) 															 
{
	var loginInfoString = req.body;
	var loginInfo = JSON.parse(loginInfoString);
	var returnInfo = new Object();

	returnInfo.config = config;
	returnInfo.error = -1;
	debug("GET Login Attempt from " + loginInfo.username);
	for (var i = 0 ; i < players.length; i++)
	{
		if (players[i].name == loginInfo.username)
		{
			if (players[i].password == loginInfo.password)
			{
				returnInfo.error = 0;
				returnInfo.players = new Array();
				for(var j = 1; j < players.length; j++)
				{
					var p = new Object();
					p.name = players[j].name;
					p.payed = players[j].payed;
					var endRound = config.round;
					if (config.pickPeriod == true && players[j].name != players[i].name)
					{
						console.log("In picking period, removing 1 round.");
						endRound--;
					}
					for(var k=1; k <= endRound; k++)
					{
						p["round" + k] = players[j]["round" + k]
					}
					returnInfo.players.push(p);
					
				}
			}
			else
			{
				console.log("WRONG PASSWORD " +  players[i].password + ":" + loginInfo.password); 
			}
		}
	}

	res.send(JSON.stringify(returnInfo, null, 2));
		
});

router.route("/bracketinfo/:type/:arg1").get(function(req, res, next) 															 
{
	debug("GET Bracket Info");
   res.send(JSON.stringify(bracket, null, 2));
});

router.route("/configInfo/:type/:arg1").get(function(req, res, next) 															 
{
	debug("GET Config Info");
   res.send(JSON.stringify(config, null, 2));
});

router.route("/playersInfo/:type/:arg1").get(function(req, res, next) 															 
{
	debug("GET Players Info");
   res.send(JSON.stringify(players, null, 2));
});

router.route("/picksinfo/:type/:arg1").post(function(req, res, next)
{
	var picksInfoString = req.body;
	var picksInfo = JSON.parse(picksInfoString);
	var currentPlayer = null;
	if (config.pickPeriod == true)
	{
		for(var i=0; i < players.length && currentPlayer == null; i++)
		{
			console.log("Comparing " + players[i].name + " with " + picksInfo.username);
			if(players[i].name == picksInfo.username && (players[i].password == undefined || players[i].password == picksInfo.password))
			{
				currentPlayer = players[i];
			}
		}
		if (currentPlayer != null)
		{
			currentPlayer["round" + config.round] = picksInfo["round" + config.round];
			var emailbody = "The following picks were received from " + currentPlayer.name + ": \n" + JSON.stringify(picksInfo["round" + config.round], null, 2) + "\n\n";
			emailbody += findEndPhrase(currentPlayer.name);

			fs.writeFileSync("playerEntries.json",
				JSON.stringify(players, null, 1),
				"utf8",
				errorProcessing);
			res.send(emailbody);
		}
		else
		{
			res.send("Could not found user");
		}
	}
	else
	{
		res.send("Not in Pick Period");
	}
	
});

router.route("/getseason/:type/:arg1").get(function(req, res, next) 															 
{
	//debug("GET Players");
	var seasonString = fs.readFileSync("season.json", "utf8");
	var seasonObj = JSON.parse(seasonString);
   res.send(JSON.stringify(seasonObj, null, 2));
});
								
router.route("/changeconfig/:type/:arg1").post(function(req, res, next) 
{
	var newConfigString = req.body;
	var newConfigObj = JSON.parse(newConfigString);
	debug((new Date()).toString() + ": Changing Config " + newConfigString);

	if (newConfigObj != null)
	{
		if (newConfigObj.password == players[0].password)
		{
			if (newConfigObj.config.round != undefined && newConfigObj.config.pickPeriod != undefined)
			{
				config = newConfigObj.config;
				fs.writeFileSync("config.json",
					JSON.stringify(config, null, 1),
					"utf8",
					errorProcessing);
				
				res.send('SUCCESS: Config changed.');
				
			}
			else
			{
				res.send('FAIL: missing info');
			}
		}
		else
		{
			res.send('FAIL: Wrong password');
		}
	}
   next();
});


router.route("/changeplayers/:type/:arg1").post(function(req, res, next) 
{
	var newConfigString = req.body;
	var newConfigObj = JSON.parse(newConfigString);
	debug((new Date()).toString() + ": Changing Player " + newConfigString);

	if (newConfigObj != null)
	{
		if (newConfigObj.password == players[0].password)
		{
			if (newConfigObj.players != undefined && newConfigObj.players.length >= 2)
			{
				players = newConfigObj.players;
				fs.writeFileSync("playerEntries.json",
					JSON.stringify(players, null, 1),
					"utf8",
					errorProcessing);
				
				res.send('SUCCESS: Players changed.');
				
			}
			else
			{
				res.send('FAIL: missing info');
			}
		}
		else
		{
			res.send('FAIL: Wrong password');
		}
	}
   next();
});

router.route("/changebracket/:type/:arg1").post(function(req, res, next) 
{
	var newConfigString = req.body;
	var newConfigObj = JSON.parse(newConfigString);
	debug((new Date()).toString() + ": Changing Bracket " + newConfigString);

	if (newConfigObj != null)
	{
		if (newConfigObj.password == players[0].password)
		{
			if (newConfigObj.bracket != undefined && newConfigObj.bracket.round1 != undefined)
			{
				bracket = newConfigObj.bracket;
				fs.writeFileSync("bracket.json",
					JSON.stringify(bracket, null, 1),
					"utf8",
					errorProcessing);
				
				res.send('SUCCESS: Bracket changed.');
				
			}
			else
			{
				res.send('FAIL: missing info');
			}
		}
		else
		{
			res.send('FAIL: Wrong password');
		}
	}
   next();
});

var findEndPhrase = function(name)
{
	var ret =  endPhrases[Math.floor(Math.random() * endPhrases.length)];
	
	for(var i=0; i < endPhrasesPerso.length; i++)
	{
		if (endPhrasesPerso[i].name == name)
		{
			var phrases = endPhrasesPerso[i].phrases
			ret = phrases[Math.floor(Math.random() * phrases.length)];
		}
	}
	ret +=  "\n\nThe WebServer";
	
	return ret;
}

var debug = function(str)
{
	console.log("----- " + (new Date()).toString() + " ----");
	console.log(str);
}
