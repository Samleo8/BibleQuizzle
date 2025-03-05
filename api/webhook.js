/*
CREATING BIBLE QUIZZLE TELEGRAM BOT USING telegraf LIBRARY.

REFERENCES:
- https:// thedevs.network/blog/build-a-simple-telegram-bot-with-node-js
- https:// www.sohamkamani.com/blog/2016/09/21/making-a-telegram-bot/

http://github.com/jsjoeio/telegram-bot-template
*/

/* RUNNING IN NODE JS:
1) now -e BOT_TOKEN='<bot-token>' --public
2) npm start
(Note that (2) will run (1) as defined in the start script)
*/

// ================LIBRARIES AND VARIABLES=================// 

// Initialising of Libraries
// Deprecated, was: micro-bot, now telegraf
const {
    Markup,
    Extra
} = require('telegraf');
const Telegraf = require('telegraf');

const bot = new Telegraf(process.env.BOT_TOKEN, {
    username: "BibleQuizzleBot"
});
// bot.use(Telegraf.log());

const fs = require('fs');

// const welcomeMessage =
//     'Welcome to Bible Quizzle, a fast-paced Bible trivia game similar to Quizzarium!\n\nTo begin the game, type /start in the bot\'s private chat, or in the group. For more information and a list of all commands, type /help';

const helpMessage =
    "Bible Quizzle is a fast-paced Bible trivia game. Once the game is started, the bot will send a question. Send in your open-ended answer and the bot will give you points for the right answer. The faster you answer, the more points you get! Each question has a 50 second timer, and hints will be given every 10 seconds. Alternatively, you can call for a /hint but that costs points. Note that for all answers, numbers are in digit (0-9) form.\n\n" +
    "/start - Starts a new game.\n" +
    "/quick - Starts a quick game of 10 rounds with category \'all\'.\n" +
    "/hint - Shows a hint and fasts-forwards timing.\n" +
    "/next - Similar to /hint, except that if 2 or more people use this command, the question is skipped entirely.\n" +
    "/stop - Stops the game.\n" +
    "/ranking - Displays the global rankings (top 10), as well as your own.\n" +
    "/suggest - Suggest questions and answers for the game (external link)!\n" +
    "/eggs - Hmm, what could this be?\n" +
    "/help - Displays this help message.\n";

let i = 0,
    j = 0;
const categories = ["All", "Old Testament", "New Testament", "Gospels", "Prophets", "Miracles", "Kings/Judges",
  "Exodus"];

const regex_alphanum = new RegExp("[A-Z0-9]", "gi");
const regex_non_alphanum = new RegExp("[^A-Z0-9]", "gi");

const ADMIN_ID = 413007985;

// ================PRE-GAME SETUP=================// 

// Make Category Array from `categories`
let catArr = [],
    rowArr = [];
catArr[0] = ["📖 " + categories[0]]; // First row is single "All" button
const nButtonsOnARow = 2;
for (i = 1; i < categories.length; i += nButtonsOnARow) {
    rowArr = [];
    for (j = 0; j < nButtonsOnARow; j++) {
        if (i + j < categories.length)
            rowArr.push("📖 " + categories[i + j]);
    }
    catArr.push(rowArr);
}

// Initialise question object
let questions = {};
compileQuestionsList = () => {
    questions["all"] = JSON.parse(fs.readFileSync('questions.json', 'utf8'));

    // console.log(questions["all"]);

    let all_questions = questions["all"];

    for (i in all_questions) {
        let _cats = all_questions[i].categories;
        if (_cats == null /*|| typeof _cats == "undefined"*/ ) continue;

        for (j = 0; j < _cats.length; j++) {
            let _cat = _cats[j].toString();
            if (questions[_cat] === undefined /*|| !questions.hasOwnProperty(_cat) */ ) {
                // Key doesn't exist, create empty array
                questions[_cat] = [];
            }

            questions[_cat].push(all_questions[i]);
        }
    }
};
compileQuestionsList();

// Suggest Q & A
const suggestionFormURL =
    "https://forms.gle/aqZ3MK8QrBGzv9PEA";

const suggestionText = "Suggest questions and answers here: " + suggestionFormURL + " !";

let _sendSuggestionLink = (ctx) => {
    ctx.reply(suggestionText);

    return;
};

bot.command('suggest', (ctx) => {
    _sendSuggestionLink(ctx);
});

// ================UI FOR START AND CHOOSING OF CATEGORIES/ROUNDS=================// 
let initGame = (ctx) => {
    // Set category
    // console.log("Pick a category: ", categories);

    switch (Game.status) {
        case "active":
        case "active_wait":
            return ctx.reply("A game is already in progress. To stop the game, type /stop");
        case "choosing_cat":
        case "choosing_category":
            resetGame();
            return chooseCategory(ctx);
        case "choosing_rounds":
            return chooseRounds(ctx);
        default:
            Game.status = "choosing_category";
            return;
    }
};

let chooseCategory = (ctx) => {
    Game.status = 'choosing_category';

    return ctx.reply(
        'Pick a Category: ',
        Extra.inReplyTo(ctx.message.message_id)
        .markup(
            Markup.keyboard(catArr)
            .oneTime()
            .resize()
        )
    );
};

let chooseRounds = (ctx) => {
    Game.status = 'choosing_rounds';

    return ctx.reply(
        'Number of Questions: ',
        Extra.inReplyTo(ctx.message.message_id)
        .markup(
            Markup.keyboard([
				["🕐 10", "🕑 20"],
				["🕔 50", "🕙 100"]
			])
            .oneTime()
            .resize()
        )
    );
};

// ================ACTUAL GAMEPLAY=================// 
// Initialise Current Game object
let Game;

resetGame = () => {
    let previousQuestionList = [];
    if (Game != null && Game.hasOwnProperty("question") && Game.question.hasOwnProperty("id_list")) {
        previousQuestionList = Game.question.id_list;
    }

    Game = {
        "status": "choosing_category", // choosing_category, choosing_rounds, active_wait, active
        "category": null,
        "rounds": {
            "current": 0,
            "total": 10
        },
        "question": {
            "id": 0, // id of question
            "id_list": [], // store all the question ids to prevent repeat
            "answerer": [] // person who answered the question: [ persons' name ] | [] (skipped)
        },
        "hints": {
            "text": "",
            "current": 0,
            "total": 4,
            "charsToReveal": [],
            "unrevealedIndex": [],
            "points": [10, 8, 5, 3, 1]
        },
        "nexts": {
            "current": {}, // object of people who put next
            "total": 2
        },
        "timer": null,
        "interval": 10, // in seconds
        "leaderboard": {},
        "global_leaderboard": null,
        "idle": {
            "questions": 0, // number of questions for which there is no user input
            "threshold": 3, // number of questions before terminating game
            "reset": function() {
                this.questions = 0;
            }
        }
    };

    Game.question.id_list = previousQuestionList;
};
resetGame();

// Start Game function
startGame = (ctx) => {
    Game.status = "active";
    Game.rounds.current = 0;
    Game.idle.reset();

    ctx.reply(undefined,
        Extra.markup(Markup.removeKeyboard())
    );
    /*ctx.reply(
        "🏁 GAME BEGINS 🏁",
        Extra.HTML().markup(
            Markup.keyboard([
                ["❓ Hint ❓","⏭ Next ⏭"],
                ["🛑 Stop Game! 🛑"]
            ])
            .oneTime().resize()
        )
    );*/

    nextQuestion(ctx);
};

// Next Question handler
nextQuestion = (ctx) => {
    // Invalid state
    if (Game.status.indexOf("active") == -1 || Game.category == null || !questions.hasOwnProperty(Game.category))
        return;

    Game.status = "active";

    // Handling of rounds
    // Check if any user input, if not stop
    Game.rounds.current++;
    if (Game.rounds.current > Game.rounds.total) {
        stopGame(ctx);
        return;
    }

    Game.idle.questions++;
    if (Game.idle.questions > Game.idle.threshold) {
        // log(Game.idle.questions + " " + Game.idle.threshold);
        stopGame(ctx);
    }

    // Handling of question selection
    if (Game.question.id_list.length == 0) {
        // log("Reloading questions for category " + Game.category);

        // Populate the id_list array with to now allow for repeats again
        for (i = 0; i < questions[Game.category].length; i++) {
            Game.question.id_list.push(i);
        }
    }

    let id_ind = getRandomInt(0, Game.question.id_list.length - 1);
    Game.question.id = Game.question.id_list[id_ind];
    Game.question.id_list.splice(id_ind, 1);

    // Reset nexts and hints

    /*Total of 4 hints:
        - -1%    |    Only the question     |    10pts
        - 0%    |    No. of characters     |    8pts
        - 20%    |    20% chars shown     |    5pts
        - 50%    |    50% chars shown     |    3pts
        - 80%    |     80% chars shown     |    1pts
    */

    Game.nexts.current = {};
    Game.hints.current = 0;

    Game.question.answerer = [];

    // Settings no. of chars to reveal for each hint interval
    let answer = _getAnswer();
    let hints_array = [0, 0, 0.2, 0.5, 0.8]; // base percentage, starting index from 1
    for (i = 2; i < hints_array.length; i++) {
        // -Getting total number of alpha-numeric characters revealed in hint
        hints_array[i] = Math.floor(hints_array[i] * answer.match(regex_alphanum)
            .length);

        // -Getting total number of NEW characters that'll need to be revealed in this hint
        hints_array[i] -= hints_array[i - 1];
    }
    Game.hints.charsToReveal = hints_array;

    // Setting indexes in answer that needs to be revealed
    Game.hints.unrevealedIndex = [];
    for (i = 0; i < answer.length; i++) {
        if (answer[i].match(regex_alphanum)) { // ie is alphanumberic
            Game.hints.unrevealedIndex.push(i);
        }
    }

    // Set hint as all underscores
    Game.hints.text = answer.replace(regex_alphanum, "_");

    // Display Question
    let questionText = _getQuestion();
    let categoriesText = _getCategories();

    _showQuestion(ctx, questionText, categoriesText);

    // Handling of timer: Hint handler every `interval` seconds
    clearTimeout(Game.timer);
    Game.timer = setTimeout(
        () => nextHint(ctx),
        Game.interval * 1000
    );
};

// Hint handler
nextHint = (ctx) => {
    if (Game.status != "active")
        return; // if it's `active_wait` also return because it means that there's no question at the point in time

    /*Total of 4 hints:
        - -1%    |    Only the question     |    100pts
        - 0%    |    No. of characters     |    -5pts
        - 20%    |    20% chars shown     |    -10pts
        - 50%    |    50% chars shown     |    -20pts
        - 80%    |     80% chars shown     |    -30pts
    */
    Game.hints.current++;
    Game.idle.reset();

    if (Game.hints.current >= Game.hints.total) {
        _showAnswer(ctx);
        return;
    }

    // Display Question
    let questionText = _getQuestion();
    let categoriesText = _getCategories();
    let answerText = _getAnswer();

    // Hint generation
    let hint = Game.hints.text.split("");
    let hints_given = Game.hints.current;
    let r = 0,
        ind = 0;

    for (i = 0; i < Game.hints.charsToReveal[hints_given]; i++) {
        r = getRandomInt(0, Game.hints.unrevealedIndex.length -
            1); // get random number to pick index `ind` from the `Game.hints.unrevealedIndex` array.

        if (Game.hints.unrevealedIndex.length <= 0) break;

        // get a random index `ind` so the character at `ind` will be revealed. pick from `unrevealedIndex` arrray so as to avoid repeat revealing and revealing of non-alphanumberic characters
        ind = Game.hints.unrevealedIndex[r];

        hint[ind] = answerText[ind]; // reveal character at index `ind`

        Game.hints.unrevealedIndex.splice(r, 1); // remove revealed character from `unrevealedIndex` array
    }
    hint = hint.join("")
        .toString();

    _showQuestion(ctx, questionText, categoriesText, hint);

    Game.hints.text = hint; // save back into `Game` object

    // Create new handler every `interval` seconds
    clearTimeout(Game.timer);
    Game.timer = setTimeout(
        () => nextHint(ctx),
        Game.interval * 1000
    );
};

// Stop Game function
stopGame = (ctx) => {
    clearTimeout(Game.timer);

    if (Game.status.indexOf("active") != -1) displayScores(ctx);

    resetGame();
    Game.status = "choosing_category";
};

// ================UI FOR QUESTIONS, ANSWERS AND SCORES=================// 
_getQuestion = () => {
    if (Game.category != null && Game.question.id != null) {
        return questions[Game.category][Game.question.id]["question"].toString();
    }

    return "";
};

_getCategories = () => {
    if (Game.category != null && Game.question.id != null) {
        return questions[Game.category][Game.question.id]["categories"].join(", ")
            .split("kings_judges")
            .join("Kings and Judges")
            .split("_")
            .join(" ")
            .toString()
            .toTitleCase();
    }

    return "";
};

_getAnswer = () => {
    if (Game.category != null && Game.question.id != null)
        return questions[Game.category][Game.question.id]["answer"].toString();

    return "";
};

_getReference = () => {
    if (Game.category != null && Game.question.id != null) {
        let _q = questions[Game.category][Game.question.id]["reference"];
        if (_q != null /* && typeof _q != "undefined" */ )
            return _q.toString();
    }

    return "-nil-";
};

// Get user's name from ctx
_getName = (ctx) => {
    let username = ctx.message.from.username;
    let first_name = ctx.message.from.first_name;
    let last_name = ctx.message.from.last_name;

    if (first_name && last_name) return first_name + " " + last_name;
    if (!first_name && !last_name) return username;
    if (first_name) return first_name;

    return last_name;
};

_showQuestion = (ctx, questionText, categoriesText, hintText) => {
    ctx.reply(
        "<b>BIBLE QUIZZLE</b>\n" +
        "ROUND <b>" + Game.rounds.current + "</b> OF <b>" + Game.rounds.total + "</b>" +
        " <i>[" + categoriesText + "]</i>" +
        "\n--------------------------------\n" +
        questionText + "\n" +
        ((hintText == null /*|| typeof hintText == "undefined"*/ ) ? "" : ("<i>Hint: </i>" + hintText.split("")
            .join(" "))),
        Extra.HTML()
        .markup((m) =>
            m.inlineKeyboard([
				m.callbackButton('Hint', 'hint'),
				m.callbackButton('Next', 'next')
			])
        )
    );
};

_showAnswer = (ctx) => {
    let answerers = removeDuplicates(Game.question.answerer);

    if (Game.question.answerer.length == 0) {
        ctx.reply(
            "😥 <b>Oh no, nobody got it right!</b>\n" +
            "💡 The answer was: <i>" + _getAnswer() + "</i> 💡\n" +
            "<i>Bible Reference: " + _getReference() + "</i>",
            Extra.HTML()
        );
    }
    else {
        let scoreboardText = "";
        let score = Game.hints.points[Game.hints.current];
        for (i = 0; i < answerers.length; i++) {
            scoreboardText += "<b>" + answerers[i].name + "</b> +" + score + "\n";

            // Update leaderboard
            if (Game.leaderboard[answerers[i].user_id] === undefined) {
                // Player doesn't exist in scoreboard, create empty object
                Game.leaderboard[answerers[i].user_id] = {
                    "id": answerers[i].user_id,
                    "score": 0, // score set at 0
                    "name": answerers[i].name
                };
            }

            Game.leaderboard[answerers[i].user_id].score = parseInt(Game.leaderboard[answerers[i].user_id].score +
                score);
        }

        ctx.reply(
            "✅ Correct!\n" +
            "💡 <b>" + _getAnswer() + "</b> 💡\n" +
            "<i>Bible Reference: " + _getReference() + "</i>\n\n" +
            "🏅 <b>Scorer(s)</b> 🏅\n" +
            scoreboardText,
            Extra.HTML()
        );
    }

    if (Game.rounds.current >= Game.rounds.total) {
        stopGame(ctx);
        return;
    }

    Game.status = "active_wait";

    // Question shows after less time?
    clearTimeout(Game.timer);
    Game.timer = setTimeout(
        () => nextQuestion(ctx),
        Game.interval * 1000 * 0.5
    );
};

// Displaying of scores
displayScores = (ctx) => {
    let scoreboardText = "";
    let scoreboardArr = [];

    // Push all stored info from `Game.leaderboard` into `scoreboardArr`
    for (i in Game.leaderboard) {
        if (!Game.leaderboard.hasOwnProperty(i)) continue;

        scoreboardArr.push(Game.leaderboard[i]);
    }

    // Handler for when nobody played but the game is stopped
    if (scoreboardArr.length == 0) {
        return ctx.reply(
            "⁉️ <b>Everybody's a winner?!?</b> ⁉️\n(\'cos nobody played... 😞)",
            Extra.HTML()
            .markup(
                Markup.keyboard([
					["🏁 Start Game! 🏁"],
					["🕐 Quick Game! 🕐", "❓ Help ❓"],
					// ["🛑 Stop Game! 🛑"],
					["📊 Ranking 📊"]
				])
                .oneTime()
                .resize()
            )
        );
    }

    // Set global rankings and obtain appropriate text
    scoreboardText += _setGlobalRanking(scoreboardArr, ctx);

    // Show the top scorers with a keyboard to start the game
    return ctx.reply(
        "🏆 <b>Top Scorers</b> 🏆\n" +
        scoreboardText +
        "\n" + suggestionText +
        "\n\nView global /ranking | /start a new game",
        Extra.HTML()
        .markup(
            Markup.keyboard([
				["🏁 Start Game! 🏁"],
				["🕐 Quick Game! 🕐", "❓ Help ❓"],
				// ["🛑 Stop Game! 🛑"],
				["📊 Ranking 📊"]
			])
            .oneTime()
            .resize()
        )
    );
};

// ================FEEDBACK FOR SETTING OF ROUND AND CATEGORY=================// 
// Initialising/Starting of Game
bot.command('start', (ctx) => {
    initGame(ctx);
});

bot.hears("🏁 Start Game! 🏁", (ctx) => {
    initGame(ctx);
});

// Category Setting
bot.hears(/📖 (.+)/, (ctx) => {
    if (Game.status != "choosing_category") return;

    const heardString = ctx.match[ctx.match.length - 1];
    if (heardString == null) return;

    const newCategory = heardString.toLowerCase()
        .replace(regex_non_alphanum, "_");

    if (newCategory == null || !questions.hasOwnProperty(newCategory)) {
        ctx.reply("Invalid category: " + heardString);
        return;
    }

    // Different category: reset list
    if (newCategory != Game.category) {
        // log("Question reset for category " + newCategory);
        Game.question.id_list = [];
    }

    Game.category = newCategory;

    chooseRounds(ctx);
});

// Round Setting
bot.hears(/(🕐|🕑|🕔|🕙)(.\d+)/, (ctx) => {
    if (Game.status != "choosing_rounds") return;

    Game.rounds.total = parseInt(ctx.match[ctx.match.length - 1]);

    startGame(ctx);
});

// ================MISC. COMMANDS=================// 
// Quick Game
_quickGame = (ctx) => {
    if (Game.status.indexOf("active") != -1) return;

    ctx.reply(
        "Starting quick game of <b>10 rounds</b> with category <b>ALL</b>",
        Extra.HTML()
        .inReplyTo(ctx.message.message_id)
    );

    Game.category = "all";
    Game.rounds.total = 10;

    startGame(ctx);
};

bot.command('quick', (ctx) => {
    _quickGame(ctx);
});

bot.hears("🕐 Quick Game! 🕐", (ctx) => {
    _quickGame(ctx);
});

// Stop Command
bot.command('stop', ctx => {
    stopGame(ctx);
});

bot.hears("🛑 Stop Game! 🛑", (ctx) => {
    stopGame(ctx);
});

// Help Command
bot.command('help', (ctx) => {
    ctx.reply(helpMessage);
});

bot.hears("❓ Help ❓", (ctx) => {
    ctx.reply(helpMessage);
});

// Hint Command and Action (from inline buttons and keyboard)
bot.command('hint', (ctx) => {
    nextHint(ctx);
});

bot.hears("❓ Hint ❓", (ctx) => {
    nextHint(ctx);
});

// Next Command and Action (from inline buttons and keyboard)
_nextCommand = (ctx) => {
    if (Game.status != "active")
        return; // if it's `active_wait` also return because it means that there's no question at the point in time

    Game.idle.reset();

    let id = (ctx.callbackQuery == undefined || ctx.callbackQuery.from == undefined || ctx.callbackQuery.from.id ==
            undefined) ?
        ctx.message.from.id : ctx.callbackQuery.from.id;

    Game.nexts.current[id] = 1;

    if (Object.keys(Game.nexts.current)
        .length >= Game.nexts.total || ctx.chat.type == "private")
        return _showAnswer(ctx);

    return nextHint(ctx);
};

bot.command('next', (ctx) => {
    _nextCommand(ctx);
});

bot.hears("⏭ Next ⏭", ctx => {
    _nextCommand(ctx);
});

// Callback Queries
bot.on('callback_query', (ctx) => {
    if (ctx.callbackQuery.from.is_bot) return;

    let cb = ctx.callbackQuery.data;

    Game.idle.reset();

    switch (cb) {
        case "next":
            ctx.answerCbQuery("Next question!")
                .catch((failureReason) => {
                    log(failureReason, "ERROR");
                });;

            _nextCommand(ctx);
            return;
        case "hint":
            ctx.answerCbQuery("Hint!")
                .catch((failureReason) => {
                    log(failureReason, "ERROR");
                });;

            nextHint(ctx);
            return;
        default:
            ctx.answerCbQuery("Invalid query " + cb)
                .catch((failureReason) => {
                    log(failureReason, "ERROR");
                });;

            return;
    }
});

// Easter Eggs
//--Eggs
bot.command('eggs', (ctx) => {
    const eggGIF = fs.createReadStream("img/egg.gif");
    const eggCaption = "Congrats, " + _getName(ctx) +
        " you found your first easter egg! \n\nEaster eggs are fun secret commands, like /eggs, that will send cute photos or gifs like this one. They range from cute typos to random words and expressions.\n\nHappy hunting!\n";
    return ctx.replyWithAnimation({
        source: eggGIF
    }, {
        caption: eggCaption
    });
});

//--HUGS!
bot.hears('/hugs', (ctx) => {
    const penguinHugsGIF = fs.createReadStream("img/penguinhugs.gif");

    return ctx.replyWithAnimation({
        source: penguinHugsGIF
    }, {
        caption: "HUGS!"
    })
});

//--Sads
bot.hears('/sads', (ctx) => {
    const jesusWeptPic = fs.createReadStream('img/jesuswept.jpg');

    return ctx.replyWithPhoto({
        source: jesusWeptPic
    }, {
        caption: "It's ok to be sad sometimes... Do you need /hugs?"
    });
});

//--Trolling with quack
bot.hears("/quack", (ctx) => {
    const quackPic = fs.createReadStream("img/quack.jpg");

    return ctx.replyWithPhoto({
        source: quackPic
    }, {
        caption: "Did you mean /quick?"
    });
});

//--Penguin(s)
bot.hears('/penguins', (ctx) => {
    const penguinGIF = fs.createReadStream("img/waddlingpenguin.gif");

    return ctx.replyWithAnimation({
        source: penguinGIF
    }, {
        caption: "Did you know? Not all penguins live in Antarctica; in fact, the Galápagos penguin lives near the equator in Ecuador!"
    })
});

// TODO: Add a easter egg leaderboard as well

// Rankings
//--Sort Leaderboard
_sortLeaderboard = () => {
    Game.global_leaderboard.sort(function(a, b) {
        return b.score - a.score;
    });
};

// --Get global ranking
_getGlobalRanking = () => {
    // Check if file exists; if not, create it to prevent problems with access permissions
    if (!fs.existsSync("leaderboard.json")) {
        log("leaderboard.json doesn't exist... creating file..");

        fs.writeFileSync(
            'leaderboard.json',
            JSON.stringify(Game.global_leaderboard, null, 4)
        );

        log("File leaderboard.json created!");
        return Game.global_leaderboard;
    }

    // Retrieve data from leaderboard.json
    Game.global_leaderboard = JSON.parse(fs.readFileSync('leaderboard.json', 'utf8'));

    return Game.global_leaderboard;
};

// --Get ranking of individual user by `user_id`
_getRanking = (user_id, ctx) => {
    // First retrieve array data from leaderboard.json
    _getGlobalRanking();

    if (user_id == null /*|| typeof user_id == "undefined"*/ ) return;

    // Find the user's data in the array
    let ind = Game.global_leaderboard.findIndex((item, i) => {
        return item.id == user_id;
    });

    if (ind == -1) {
        // Data of user doesn't exist:
        // Add it to the leaderboard array
        Game.global_leaderboard.push({
            "id": user_id,
            "name": Game.leaderboard[user_id].name,
            "score": 0
        });

        // Sort and save
        _sortLeaderboard();

        let data = JSON.stringify(Game.global_leaderboard, null, 4);

        log("Global leaderboard: " + data);

        fs.writeFileSync('leaderboard.json', data);

        log("File written for new user " + user_id + ", data: " + data);

        // Return new index
        ind = Game.global_leaderboard.findIndex((item, i) => {
            return item.id == user_id;
        });

        return ind;
    }
    else {
        return ind;
    }
};

// --Update leaderboard for user `user_id` with score `score`
_setRankingIndividual = (user_id, score, ctx) => {
    if (user_id == null /*|| typeof user_id == "undefined"*/ ) return;

    let ind = _getRanking(user_id, ctx);

    // Change score
    if (!isNaN(parseInt(score)) && !isNaN(parseInt(ind))) {
        Game.global_leaderboard[ind].score += score;
    }
};

// Set multiple rankings at once to save time on constantly sorting
// Also generate the output text
_setGlobalRanking = (scoreboardArr, ctx) => {
    let scoreboardText = "";

    // First sort the top scorers from `scoreboardArr` in descending order (highest score first)
    scoreboardArr.sort(function(a, b) {
        return b.score - a.score;
    });

    // Then loop through sorted scoreboard array to set individual ranking
    for (i = 0; i < scoreboardArr.length; i++) {
        scoreboardText += "<b>" + parseInt(i + 1) + ". " + scoreboardArr[i].name + "</b> <i>(" +
            scoreboardArr[i].score + " points)</i>\n";

        _setRankingIndividual(scoreboardArr[i].id, scoreboardArr[i].score, ctx);
    }

    // Sort and save
    _sortLeaderboard();

    fs.writeFileSync(
        'leaderboard.json',
        JSON.stringify(Game.global_leaderboard, null, 4)
    );

    // TODO: Fix issue #15, then remove
    _sendAdminJSONRanking(ctx);

    return scoreboardText;
};

_showRanking = (ctx) => {
    let ind = _getRanking(ctx.message.from.id, ctx);
    // Note that `Game.global_leaderboard` is already updated in the `_getGlobalRanking()` function embedded in `_getRanking()`

    let leaderboardText = '';
    for (i = 0; i < Math.min(Game.global_leaderboard.length, 20); i++) {
        if (ind == i) leaderboardText += "👉 ";

        switch (i) {
            case 0:
                leaderboardText += "🥇 ";
                break;
            case 1:
                leaderboardText += "🥈 ";
                break;
            case 2:
                leaderboardText += "🥉 ";
                break;
            default:
                leaderboardText += "<b>" + parseInt(i + 1) + ".</b> ";
        }

        leaderboardText += "<b>" + Game.global_leaderboard[i].name + "</b> ";
        // if(ind == i) leaderboardText+="<b>";
        leaderboardText += "<i>(" + Game.global_leaderboard[i].score + " points)</i>";
        // if(ind == i) leaderboardText+="</b>";

        if (ind == i) leaderboardText += " 👈";

        leaderboardText += "\n";
    }

    // User is not part of the top 20
    if (ind >= 20) {
        leaderboardText += "<b>👉 " + Game.global_leaderboard[ind].name + " <i>(" + Game.global_leaderboard[ind]
            .score +
            " points)</i> 👈</b>";
    }

    ctx.reply(
        "🏆 <b>Global Ranking</b> 🏆\n" +
        "<b>----------------------------------</b>\n" +
        leaderboardText,
        Extra.HTML()
        .inReplyTo(ctx.message.message_id)
    );
};

bot.command('ranking', (ctx) => {
    _showRanking(ctx);
});

bot.hears('📊 Ranking 📊', (ctx) => {
    _showRanking(ctx);
});

// Debug Stuff
bot.hears('/show_ranking', (ctx) => {
    if (ctx.message.from.id != ADMIN_ID) {
        // if it isn't the admin's (mine, Samuel Leong's) telegram ID, return
        _showRanking(ctx);
        return;
    }

    _getGlobalRanking();

    ctx.reply(
        "ADMIN DEBUG! Displaying entire ranking for saving...\n" +
        "==========================\n" +
        JSON.stringify(Game.global_leaderboard, null, 4)
    );
});

// Send admin the ranking JSON
let prevSentAdminMessageID = 0;

_sendAdminJSONRanking = (ctx) => {
    _getGlobalRanking();

    // Delete any old messages sent by the bot
    if (prevSentAdminMessageID != 0) {
        const chatID = ADMIN_ID;
        const msgID = prevSentAdminMessageID;

        bot.telegram.deleteMessage(chatID, msgID)
            .catch((reason) => {
                log('Failed to delete message: ' + reason, "ERROR");
            });
    }

    // Send message accordingly
    bot.telegram.sendMessage(ADMIN_ID,
            JSON.stringify(Game.global_leaderboard, null, 4), {
                disable_notification: true
            })
        .then((messageReturn) => {
            prevSentAdminMessageID = messageReturn.message_id;
        }, (failureReason) => {
            log('Failed to send leaderboard debug message: ' + failureReason, "ERROR")
        });

    // Then pin the message for good measure
    bot.telegram.pinChatMessage(ADMIN_ID, prevSentAdminMessageID);
};

// ================HANDLING OF RETRIEVED ANSWERS FROM USERS=================// 
// NOTE: This function needs to be at the bottom so that the bot hears commands and other stuff first, or else this function will just 'return' and not run anything else

bot.on('message', (ctx) => {
    if (Game.status != "active") return;

    let msg = ctx.message.text;
    const user_id = ctx.message.from.id;

    const name = _getName(ctx);
    let answer = _getAnswer();

    // Ignore empty messages
    if (msg == null) return;

    // Ignore messages from a bot
    if (ctx.message.from.is_bot) return;

    // Strip non alphanumeric characters from messages and answers
    msg = msg.replace(regex_non_alphanum, "")
        .toLowerCase();
    answer = answer.replace(regex_non_alphanum, "")
        .toLowerCase();

    // log("ID: " + user_id + " | Name: " + name + " | Ans: " + answer);
    Game.idle.reset();

    if (msg.indexOf(answer) != -1) { // message contains answer!
        Game.question.answerer.push({
            "user_id": user_id,
            "name": name
        });

        _showAnswer(ctx);
    }
});

// ================EXPORT BOT=================// 
module.exports = bot;

// Start webhook via launch method (preferred)
// bot.launch({
//         webhook: {
//             domain: "https://bible-quizzle.vercel.app/api/webhook",
//             port: 3000
//         }
//     })
//     .then(() => console.log("Webhook bot listening on port", port));

export default async (req, res) => {
    try {
        // Retrieve the POST request body that gets sent from Telegram
        const {
            body,
            query
        } = req

        if (query.setWebhook === "true") {
            const webhookUrl =
                `https://bible-quizzle.vercel.app/api/telegram-hook?secret_hash=${process.env.SECRET_HASH}`

            // Would be nice to somehow do this in a build file or something
            const isSet = await bot.telegram.setWebhook(webhookUrl)
            console.log(`Set webhook to ${webhookUrl}: ${isSet}`)
        }

        if (query.secret_hash === SECRET_HASH) {
            await bot.handleUpdate(body)
        }
    }
    catch (error) {
        // If there was an error sending our message then we
        // can log it into the Vercel console
        console.error("Error sending message")
        console.log(error.toString())
    }

    // Acknowledge the message with Telegram
    // by sending a 200 HTTP status code
    // The message here doesn't matter.
    res.status(200)
        .send("OK")
}

// ================MISC. FUNCTIONS=================// 
// Logging
log = (msg, type) => {
    type = type || "DEBUG";

    console.log("[" + type + "] " + msg);
};

// Get random integer: [min,max]
getRandomInt = (min, max) => {
    return Math.floor(Math.random() * (max - min + 1)) + min;
};

// Get random float: [min,max)
getRandomFloatExcl = (min, max) => {
    return Math.random() * (max - min) + min;
};

// Remove duplicates in array
removeDuplicates = (_array) => {
    let _i, _j, arr = [];
    let found = false;
    for (_i = 0; _i < _array.length; _i++) {
        found = false;
        for (_j = 0; _j < arr.length; _j++) {
            if (_array[_i] == arr[_j] || (JSON.stringify(_array[_i]) == JSON.stringify(arr[_j]) && typeof _array[
                        _i] ==
                    typeof arr[_j])) {
                found = true;
                break;
            }
        }
        if (!found) arr.push(_array[_i]);
    }

    return arr;
};

// Convert to title case
String.prototype.toTitleCase = function() {
    var i, j, str, lowers, uppers;
    str = this.replace(/([^\W_]+[^\s-]*) */g, function(txt) {
        return txt.charAt(0)
            .toUpperCase() + txt.substr(1)
            .toLowerCase();
    });

    // Certain minor words should be left lowercase unless
    // they are the first or last words in the string
    lowers = ['A', 'An', 'The', 'And', 'But', 'Or', 'For', 'Nor', 'As', 'At',
		'By', 'For', 'From', 'In', 'Into', 'Near', 'Of', 'On', 'Onto', 'To', 'With'
	];
    for (i = 0, j = lowers.length; i < j; i++)
        str = str.replace(new RegExp('\\s' + lowers[i] + '\\s', 'g'),
            function(txt) {
                return txt.toLowerCase();
            });

    // Certain words such as initialisms or acronyms should be left uppercase
    uppers = ['Id', 'Tv'];
    for (i = 0, j = uppers.length; i < j; i++)
        str = str.replace(new RegExp('\\b' + uppers[i] + '\\b', 'g'),
            uppers[i].toUpperCase());

    return str;
};

/* CONVERSION OF EXCEL QUESTIONS TO JSON:

// Array Creation of JSON formatted q&a
a = [ (_input_) ]

arr = []; keys = ["question","answer","categories","reference"]; 

for(i in a){
    obj = {};
    b = a[i].split("\t");
    for(j=0;j<keys.length;j++){
        if(j!=2) obj[keys[j]] = b[j].toString();
        else obj[keys[j]] = b[j].toLowerCase().split(", ").join(",").split(" ").join("_").split("/").join("_").split(",");
    } arr.push(obj);
    // console.log(JSON.stringify(obj,null,2));
}

console.log(JSON.stringify(arr,null,2));

// Formatting for easier copying
x = JSON.stringify(arr);
for(i in keys){
    k = keys[i].toString();
    r = new RegExp('"'+k+'":',"gi");
    x = x.replace(r,'\n\t"'+k+'":')
}
x = x.split("[{").join("{").split("}]").join("\n}");
x.split("},{").join("\n},\n{");

*/
