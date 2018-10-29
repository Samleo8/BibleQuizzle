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
	questions["all"] = JSON.parse(fs.readFileSync('questions.json', 'utf8')).questions;

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

//Initialise Current Game object
let currentGame;

resetGame = ()=>{
	currentGame = {
		"status": "choosing_category", //choosing_category, choosing_rounds, active
		"category":null,
		"currentRound":0,
		"totalRounds":10,
		"currentQuestion":{
			"id":0, //id of question
			"hints_given":0,
			"answerer":null
		},
		"timer": null
	};
}; resetGame();

let scores = {};

//Start Game function
startGame = (ctx)=>{
	currentGame.status = "active";
	currentGame.currentRound = 0;

/*
	for(i=0;i<questions[currentGame.category].length;i++){
		ctx.reply(i+": "+questions[currentGame.category][i]["question"]);
	}
*/

	nextQuestion(ctx);
};

nextQuestion = (ctx)=>{
	//ctx.reply("Question!");

	//Handling of rounds
	currentGame.currentRound++;
	if(currentGame.currentRound>currentGame.totalRounds) return;

	//Handling of question selection
	let questionID = getRandomInt(0,questions[currentGame.category].length-1);
	currentGame.currentQuestion.id = questionID;

	currentGame.currentQuestion.hints_given = 0;

	//Display Question
	let questionText = 	questions[currentGame.category][questionID]["question"];

	/*
	ctx.reply(currentGame.currentRound+" "+currentGame.totalRounds);
	ctx.reply(questionID);
	ctx.reply(questionText);
	//*/
	ctx.reply("Question: "+questionText);

	ctx.reply("<b>BIBLE QUIZZLE</b>\nROUND <b>"+currentGame.currentRound+"</b> OF <b>"+currentGame.totalRounds+"</b>\n------------------------\n"+questionText, Extra.HTML());

	//Handling of timer
	currentGame.timer = setInterval((ctx)=>{ nextHint(ctx); },10*1000); //10 seconds
}

nextHint = (ctx)=>{
	/*Total of 4 hints:
		- -1%	|	Only the question 	|	100pts
		- 0%	|	No. of characters 	|	-5pts
		- 20%	|	20% chars shown 	|	-10pts
		- 50%	|	50% chars shown 	|	-20pts
		- 80%	| 	80% chars shown 	|	-30pts
	*/
	ctx.reply("Hint!");

	currentGame.currentQuestion.hints_given++;
	if(currentGame.currentQuestion.hints_given>4){
		showAnswer(ctx);
		return;
	}

	//Display Question
	let question = 	questions[currentGame.category][currentGame.currentQuestion.id]["question"];
	let answer = questions[currentGame.category][currentGame.currentQuestion.id]["answer"];
	let hint = answer.replace(/[A-Z0-9]/gi,"_");

	ctx.reply("<b>BIBLE QUIZZLE**\nROUND <b>"+currentGame.currentRound+"</b> OF <b>"+currentGame.totalRounds+"</b>\n------------------------\n"+question+"\n\n<i>Hint: </i>"+hint, Extra.HTML());

}

showAnswer = (ctx)=>{
	clearInterval(currentGame.timer);
}

//Displaying of scores
displayScores = (ctx)=>{

}

//Stop Game function
stopGame = (ctx)=>{
	clearInterval(currentGame.timer);

	displayScores(ctx);

	resetGame();
}

//Begin Command and Control
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

	switch(currentGame.status){
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
			currentGame.status = "choosing_category";
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

//Setting of rounds and categories
bot.hears(/📖 (.+)/, (ctx)=>{ //Category Setting
	currentGame.category = ctx.match[ctx.match.length-1].toLowerCase().split(" ").join("_");
	chooseRounds(ctx);
});

bot.hears(/(🕐|🕑|🕔|🕙)(.\d+)/, (ctx)=>{ //Round Setting
	currentGame.totalRounds = parseInt(ctx.match[ctx.match.length-1]);

	//ctx.reply("Starting game with category "+currentGame.category+", "+currentGame.totalRounds+" rounds");

	startGame(ctx);
});

bot.command('stop', ctx => {
	stopGame();
});

bot.command('help', ctx => {
	//const extra = Object.assign({}, Composer.markdown());
	ctx.reply(helpMessage);
})

module.exports = bot;

//Library Functions
getRandomInt = (min, max)=>{
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

getRandomExcl = (min, max)=>{
    return Math.random() * (max - min) + min;
}
