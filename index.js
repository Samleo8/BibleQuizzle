/*
CREATING BIBLE QUIZZLE TELEGRAM BOT USING telegraf LIBRARY.

REFERENCES:
- https://thedevs.network/blog/build-a-simple-telegram-bot-with-node-js
- https://www.sohamkamani.com/blog/2016/09/21/making-a-telegram-bot/
*/

/* RUNNING IN NODE JS:
1) now -e BOT_TOKEN='633536414:AAENJwkQwYN3TGOe3LmFw2VyJFr8p7dU9II' --public
2) npm start
(Note that (2) will run (1) as defined in the start script)
*/

//================LIBRARIES AND VARIABLES=================//

//Initialising of Libraries
const { Markup, Extra } = require('micro-bot');
const Telegraf  = require('micro-bot');

const bot = new Telegraf(process.env.BOT_TOKEN, { username: "@BibleQuizzleBot"});
bot.use(Telegraf.log());

const fs = require('fs');

const welcomeMessage = 'Welcome to Bible Quizzle, a fast-paced Bible trivia game similar to Quizzarium!\n\nTo begin the game, type /start in the bot\'s private chat, or in the group. For more information and a list of all commands, type /help';

const helpMessage =
"Bible Quizzle is a fast-paced Bible trivia game. Once the game is started, the bot will send a question. Send in your open-ended answer and the bot will give you points for the right answer. The faster you answer, the more points you get! Each question has a 50 second timer, and hints will be given every 10 seconds. Alternatively, you can call for a /hint but that costs points.\n\n"+
"/start Starts a new game.\n"+
"/hint Shows a hint and fasts-forwards timing.\n"+
"/next Similar to /hint, except that if 2 or more people use this command, the question is skipped entirely.\n"+
"/stop Stops the game.\n"+
"/help Displays this help message.\n";

let i = 0,j=0;
const categories = ["All","Old Testament","New Testament","Gospels","Prophets","Miracles"];
const regex_alphanum = new RegExp("[A-Z0-9]","gi");

//================PRE-GAME SETUP=================//

//Make Category Array from `categories`
let catArr = [], rowArr = [];
catArr[0] = ["📖 "+categories[0]]; //First row is single "All" button
const nButtonsOnARow = 2;
for(i=1;i<categories.length;i+=nButtonsOnARow){
	rowArr = [];
	for(j=0;j<nButtonsOnARow;j++){
		if(i+j<categories.length)
			rowArr.push("📖 "+categories[i+j]);
	}
	catArr.push(rowArr);
}

//Initialise question object
let questions = {};
compileQuestionsList = ()=>{
	questions["all"] = JSON.parse(fs.readFileSync('questions.json', 'utf8'));

	let all_questions = questions["all"];
	//TODO: Get by category
	for(i in all_questions){
		let _cats = all_questions[i].categories;
		for(j=0;j<_cats.length;j++){
			let _cat = _cats[j].toString();
			if( questions[_cat] === undefined /*|| !questions.hasOwnProperty(_cat) */){
				//Key doesn't exist, create empty array
				questions[_cat] = [];
			}

			questions[_cat].push(all_questions[i]);
		}
	}
}

compileQuestionsList();

//================ACTUAL GAMEPLAY=================//
//Initialise Current Game object
let Game;

resetGame = ()=>{
	Game = {
		"status": "choosing_category", //choosing_category, choosing_rounds, active
		"category":null,
		"rounds":{
			"current":0,
			"total":10
		},
		"question":{
			"id":0, //id of question
			"answerer":null //person who answered the question: null | person's name | skipped
		},
		"hints":{
			"text":"",
			"given":0,
			"total":4,
			"charsToReveal":[],
			"unrevealedIndex":[]
		},
		"nexts":{
			"current":0,
			"total":2
		},
		"timer": null,
		"interval":10, //in seconds
		"leaderboard":{}
	};
}; resetGame();

let scores = {};

//Start Game function
startGame = (ctx)=>{
	Game.status = "active";
	Game.rounds.current = 0;

	nextQuestion(ctx);
};

//Next Question handler
nextQuestion = (ctx)=>{
	//Handling of rounds
	Game.rounds.current++;
	if(Game.rounds.current>Game.rounds.total) return;

	//Handling of question selection
	Game.question.id = getRandomInt(0,questions[Game.category].length-1);

	//Reset nexts and hints

		/*Total of 4 hints:
			- -1%	|	Only the question 	|	100pts
			- 0%	|	No. of characters 	|	-5pts
			- 20%	|	20% chars shown 	|	-10pts
			- 50%	|	50% chars shown 	|	-20pts
			- 80%	| 	80% chars shown 	|	-30pts
		*/

	Game.nexts.current = 0;
	Game.hints.given = 0;

	//Settings no. of chars to reveal for each hint interval
	let answer = _getAnswer();
	let hints_array = [0,0.2,0.5,0.8]; //base percentage
	for(i=0;i<hints_array.length;i++){
		//-Getting total number of alpha-numeric characters revealed in hint
		hints_array[i] = Math.floor(hints_array[i]*answer.match(regex_alphanum).length);

		//-Getting total number of NEW characters that'll need to be revealed in this hint
		if(i) hints_array[i]-=hints_array[i-1];
	}
	Game.hints.charsToReveal = hints_array;

	//Setting indexes in answer that needs to be revealed
	Game.hints.unrevealedIndex = [];
	for(i=0;i<answer.length;i++){
		if(answer[i].match(regex_alphanum).length>0){ //ie is alphanumberic
			Game.hints.unrevealedIndex.push(i);
		}
	}

	//Set hint as all underscores
	Game.hints.text = answerText.replace(regex_alphanum,"_");

	//Display Question
	let questionText = _getQuestion();

	ctx.reply(
		"<b>BIBLE QUIZZLE</b>\n"+
		"ROUND <b>"+Game.rounds.current+"</b> OF <b>"+Game.rounds.total+"</b>"+
		"\n------------------------\n"+
		questionText,
		Extra.HTML().markup((m) =>
			m.inlineKeyboard([
				m.callbackButton('Hint', 'hint'),
				m.callbackButton('Next', 'next')
			])
		)
	);

	//Handling of timer: Hint handler every `interval` seconds
	Game.timer = setTimeout(
		()=>nextHint(ctx),
		Game.interval*1000
	);
}

//Obtaining question and answer from Game object
_getQuestion = ()=>{
	if(Game.category!=null && Game.question.id!=null)
		return questions[Game.category][Game.question.id]["question"].toString();
};
_getAnswer = ()=>{
	if(Game.category!=null && Game.question.id!=null)
		return questions[Game.category][Game.question.id]["answer"].toString();
};

_showQuestion = (ctx, questionText, hintText)=>{
	return ctx.reply(
		"<b>BIBLE QUIZZLE</b>\n"+
		"ROUND <b>"+Game.rounds.current+"</b> OF <b>"+Game.rounds.total+"</b>"+
		"\n------------------------\n"+
		questionText+"\n"+
		( (hintText==null || typeof hintText=='undefined')?"":"<i>Hint: </i>"+hint.split("").join(" ") ),
		Extra.HTML().markup((m) =>
			m.inlineKeyboard([
				m.callbackButton('Hint', 'hint'),
				m.callbackButton('Next', 'next')
			])
		)
	);
};

//Hint handler
nextHint = (ctx)=>{
	/*Total of 4 hints:
		- -1%	|	Only the question 	|	100pts
		- 0%	|	No. of characters 	|	-5pts
		- 20%	|	20% chars shown 	|	-10pts
		- 50%	|	50% chars shown 	|	-20pts
		- 80%	| 	80% chars shown 	|	-30pts
	*/
	Game.hints.given++;

	if(Game.hints.given>=Game.hints.total || Game.hints.charsToReveal[Game.hints.given] == 0){
		showAnswer(ctx);
		return;
	}

	//Display Question
	let questionText = _getQuestion();
	let answerText = _getAnswer();

	//Hint generation
	let hint = Game.hints.text;
	let hints_given = Game.hints.given;
	let r=0, ind = 0;

	for(i=0;i<Game.hints.charsToReveal[Game.hints.given];i++){
		r = getRandomInt(0,Game.hints.unrevealedIndex.length-1); //get random number to pick index `ind` from the `Game.hints.unrevealedIndex` array.

		if(Game.hints.unrevealedIndex.length<=0) break;

		ind = Game.hints.unrevealedIndex[r]; //get a random index `ind` so the character at `ind` will be revealed. pick from `unrevealedIndex` arrray so as to avoid repeat revealing and revealing of non-alphanumberic characters

		hint[ind] = answerText[ind]; //reveal character at index `ind`

		Game.hints.unrevealedIndex.splice(r,1); //remove revealed character from `unrevealedIndex` array
	}
	Game.hints.text = hint; //save back into `Game` object

	//Insert spaces into the hint to make it look nice
	//Display output
	ctx.reply(
		"<b>BIBLE QUIZZLE</b>\n"+
		"ROUND <b>"+Game.rounds.current+"</b> OF <b>"+Game.rounds.total+"</b>"+
		"\n------------------------\n"+
		questionText+"\n"+
		"<i>Hint: </i>"+hint.split("").join(" "),
		Extra.HTML().markup((m) =>
			m.inlineKeyboard([
				m.callbackButton('Hint', 'hint'),
				m.callbackButton('Next', 'next')
			])
		)
	);

	//Create new handler every `interval` seconds
	clearTimeout(Game.timer);
	Game.timer = setTimeout(
		()=>nextHint(ctx),
		Game.interval*1000
	);
}

showAnswer = (ctx)=>{
	ctx.reply(_getAnswer());

	clearTimeout(Game.timer);
	Game.timer = setTimeout(
		()=>nextQuestion(ctx),
		Game.interval*1000
	);
}

//Displaying of scores
displayScores = (ctx)=>{
	ctx.reply("GAME ENDED!");
}

//Stop Game function
stopGame = (ctx)=>{
	clearTimeout(Game.timer);

	displayScores(ctx);

	resetGame();
}

//================UI FOR START AND CHOOSING OF CATEGORIES/ROUNDS=================//
bot.command('start', (ctx) => {
	//ctx.reply(welcomeMessageSent?"Welcome Message Sent before":"Welcome Message not sent before");

	//Send welcome message on first send
	/*if(!welcomeMessageSent){
		ctx.reply(welcomeMessage);
		welcomeMessageSent = true;
		console.log("Welcome!");
		return;
	}*/

	//Set category
	console.log("Pick a category: ", categories);

	switch(Game.status){
		case "active":
			return ctx.reply("A game is already in progress. To stop the game, type /stop");
		case "choosing_cat":
		case "choosing_category":
			resetGame();
			return chooseCategory(ctx);
		case "choosing_rounds":
			return chooseRounds(ctx);
			return;
		default:
			Game.status = "choosing_category";
			return;
	}
});

let chooseCategory = (ctx) => {
	return ctx.reply(
		'Pick a Category: ',
		Extra.inReplyTo(ctx.message.message_id).markup(
			Markup.keyboard(catArr)
			.oneTime().resize()
		)
	);
};

let chooseRounds = (ctx) => {
	return ctx.reply(
		'Number of Questions: ',
		Extra.inReplyTo(ctx.message.message_id).markup(
			Markup.keyboard([
				["🕐 10","🕑 20"],
				["🕔 50","🕙 100"]
			])
			.oneTime().resize()
		)
	);
};

//================FEEDBACK FOR SETTING OF ROUND AND CATEGORY=================//
//Category Setting
bot.hears(/📖 (.+)/, (ctx)=>{
	Game.category = ctx.match[ctx.match.length-1].toLowerCase().split(" ").join("_");
	chooseRounds(ctx);
});

//Round Setting
bot.hears(/(🕐|🕑|🕔|🕙)(.\d+)/, (ctx)=>{
	Game.rounds.total = parseInt(ctx.match[ctx.match.length-1]);

	//ctx.reply("Starting game with category "+Game.category+", "+Game.rounds.total+" rounds");

	startGame(ctx);
});

//================MISC. COMMANDS=================//
//Stop Command
bot.command('stop', ctx => {
	stopGame();
});

//Help Command
bot.command('help', ctx => {
	//const extra = Object.assign({}, Composer.markdown());
	ctx.reply(helpMessage);
});

//Hint Command and Action (from inline buttons)
bot.command('hint', ctx => {
	nextHint(ctx);
});
bot.action('hint', ctx => {
	nextHint(ctx);
	//ctx.reply("/hint");
});

//Next Command and Action (from inline buttons)
bot.command('next', ctx => {
	Game.nexts.current++;
	if(Game.nexts.current>=Game.nexts.total)
		return showAnswer(ctx);

	return nextHint(ctx);
});
bot.action('next', ctx => {
	Game.nexts.current++;
	if(Game.nexts.current>=Game.nexts.total)
		return showAnswer(ctx);

	return nextHint(ctx);
});

module.exports = bot;

//================MISC. FUNCTIONS=================//
//Get random integer: [min,max]
getRandomInt = (min, max)=>{
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

//Get random float: [min,max)
getRandomExcl = (min, max)=>{
    return Math.random() * (max - min) + min;
}
