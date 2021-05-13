const fs = require("fs")
const seedrandom = require("seedrandom")
const {Telegraf, Markup} = require("telegraf")
const winston = require("winston")
const googlecalendar = require("./googlecalendar.js")
const {botToken, myId, calId} = require("./secret.js")
const TESTING = false

// params

const ROOM_CAPACITY = 3
const ROOM_NAME = "the Sacred Office of Paolo Provero"
const ROOM_DOOMSDAY = -(2*24+12)*60*60*1000 // relative to the next monday
const ROOM_APOCALYPSE_MESSAGE = "Don't forget to submit the form"

const DAYS = [
    'mon_am', 'mon_pm',
    'tue_am', 'tue_pm',
    'wed_am', 'wed_pm',
    'thu_am', 'thu_pm',
    'fri_am', 'fri_pm'
]
var calendarKeyboard = []
DAYS.forEach((day_id, index) => {
    var day_name = day_id.split('_').join(' ')
    day_name = day_name.charAt(0).toUpperCase() + day_name.slice(1)
    calendarKeyboard.push([
        Markup.button.callback(
            day_name + ":",
            'slot' + index + '_null'),
        Markup.button.callback(
            'I must',
            'slot' + index + '_must'),
        Markup.button.callback(
            'I could',
            'slot' + index + '_could'),
        Markup.button.callback(
            'I can\'t',
            'slot' + index + '_cannot')
    ])
})

const INITIAL_KARMA = 128

// logger

const {combine, timestamp, prettyPrint} = winston.format
const logger = winston.createLogger({
    format: combine(
        timestamp(),
        prettyPrint()
    ),
    transports: [
        new winston.transports.File({filename: __dirname + '/error.log', level: 'error'}),
        new winston.transports.File({filename: __dirname + '/combined.log', level: 'debug'}),
        new winston.transports.Console({format: winston.format.simple(), level: 'debug'}),
    ]
})
logger.exitOnError = false
if (TESTING)
    logger.add(new winston.transports.Console({
        format: winston.format.simple(),
        level: 'debug',
    }))

// classes

class Employee {
    constructor(id, username, first_name, last_name) {
        this.id = id
        this.username = username
        this.first_name = first_name
        this.last_name = last_name
        this.name = first_name
        this.karma = INITIAL_KARMA
        if (username == undefined)
            this.username = '<a href="tg://user?id=' + id + '>' + name + '</a>'
    }
    punish() {
        if (INITIAL_KARMA*Math.random() >= this.karma) {
            this.karma *= 2
            this.karma = Math.min(this.karma, INITIAL_KARMA)
            return true
        }
        return false
    }
    unpunish() {
        this.karma /= 2
    }
    increaseKarma() {
        this.karma += 8
        this.karma = Math.min(this.karma, INITIAL_KARMA)
    }
    decreaseKarma() {
        this.karma /= 2
    }
}

class Slot {
    constructor(id, name, start, end) {
        this.id = id
        this.name = name
        this.start = start
        this.end = end
        this.capacity = ROOM_CAPACITY
        this.remainingCapacity = ROOM_CAPACITY
        this.preferences = {} // hash with the selected preference of each
        this.virdict = [] // array with max three names
        this.punished = [] // array with who has been punished
    }
    addPreference(id, what) {
        // if the preference is updated, return true; if nothing 
        // changed, return false
        if (this.preferences[id] == what)
            return false
        this.preferences[id] = what
        return true
    }
    getPreference(id) {
        return this.preferences[id]
    }
    getPretenders() {
        return Object.keys(this.preferences)
    }
    addLuckyBastards(lb) {
        this.virdict = this.virdict.concat(lb)
        this.remainingCapacity -= lb.length
    }
}

class Judgement {
    constructor(start, end, index, day, virdict) {
        this.start = start
        this.end = end
        this.index = index
        this.day = day
        this.virdict = []
        virdict.forEach((person, index) => {
            this.virdict.push(person)
        })
    }
}

class Chat {
    constructor(id) {
        this.id = id
        this.employees = {}
        this.slots = []
        this.judgements = {}
        this.week = null
        this.previousMessage = null
        this.addToCalendar = false
    }
    updateWeek(monday) {
        this.week = monday
        this.slots = []
        DAYS.forEach((day_id, index) => {
            var day_name = day_id.split('_').join(' ')
            day_name = day_name.charAt(0).toUpperCase() + day_name.slice(1)
            var day_index = index / 2
            var hour_start = index % 2 ? 14 : 9
            var hour_end = index % 2 ? 30 : 14
            this.slots.push(new Slot(
                day_id,
                day_name,
                monday.getTime() + (day_index*24+hour_start)*60*60*1000,
                monday.getTime() + (day_index*24+hour_end)*60*60*1000
            ))
        })
    }
    updateEmployee(id, username, first_name, last_name) {
        if (this.employees[id] == null)
            this.employees[id] = new Employee(
                String(id),
                username,
                first_name,
                last_name
            )
        else {
            this.employees[id].username = username
            this.employees[id].first_name = first_name
            this.employees[id].last_name = last_name
        }
        Object.keys(this.employees).forEach((per, indexPer) => {
        Object.keys(this.employees).forEach((son, indexSon) => {
            var e1 = this.employees[per]
            var e2 = this.employees[son]
            if (per != son && e1.first_name == e2.first_name)
                e1.name = e1.first_name + " " + e1.last_name
        })
        })
    }
    getWeek() {
        return this.week
    }
    getCurrentWeek() {
        return new Date(this.getWeek().getTime() - 7*24*60*60*1000)
    }
    getDoomsday() {
        return new Date(this.getWeek().getTime() + ROOM_DOOMSDAY)
    }
    printWeek() {
        return this.getWeek().toLocaleString(
            'en-GB',
            {weekday: 'long', month: 'long', day: 'numeric'}
        )
    }
    printNumericWeek() {
        return this.getWeek().toLocaleString(
            'en-GB',
            {year: 'numeric', month: 'numeric', day: 'numeric'}
        )
    }
    printNumericCurrentWeek() {
        return this.getCurrentWeek().toLocaleString(
            'en-GB',
            {year: 'numeric', month: 'numeric', day: 'numeric'}
        )
    }
    printDoomsday() {
        return this.getDoomsday().toLocaleString(
            'en-GB',
            {weekday: 'long', month: 'long', day: 'numeric'}
        ) + " at " +
        this.getDoomsday().toLocaleTimeString(
            'en-GB',
            {timestyle: 'full', hour: "2-digit", minute: "2-digit" }
        )
    }
    getDays() {
        return this.slots
    }
    getRandomDays() {
        return getRandomSubarray(this.slots, this.slots.length)
    }
    getEmployeesId() {
        return Object.keys(this.employees)
    }
    getJudgements() {
        return Object.keys(this.judgements)
    }
    getThisWeeksJudgements() {
        // they must come before the week's monday
        var r = []
        Object.keys(this.judgements).forEach((judgement, index) => {
            if (judgement < this.week.getTime())
                r.push(this.judgements[judgement])
        })
        return r
    }
}

composeMessage = function(chat) {
    var s = "*Week of the " + chat.printNumericWeek() + "*\n"
    s += "Thou shalt now be judged for the week starting on " +
        chat.printWeek() + ". Confess your preferences " +
        "by tapping the buttons below and I shall decide when you " +
        "can enter the Office, which has only " + ROOM_CAPACITY +
        " places. You have time until " + chat.printDoomsday() +
        " to change your preferences. Then, the apocalypse " +
        "will come and you will be permanently judged, for this week.\n"

    s += "\n*Confessions*"
    chat.getDays().forEach((day, indexDay) => {
        s += "\n_" + day.name + "_: "
        day.getPretenders().forEach((id, index) => {
            s += chat.employees[id].name + ' ' + day.getPreference(id)
            if (index < day.getPretenders().length - 1)
                s += ', '
        })
    })
 
    var anyPunished = false
    var candidateMust = {}
    var candidateCould = {}
    var nAssigned = {}
    chat.getEmployeesId().forEach((id, index) => {
        nAssigned[id] = 0
    })

    // easy decisions
    chat.getDays().forEach((day, indexDay) => {
        day.remainingCapacity = day.capacity
        day.punished.forEach((id, indexId) => {
            // Needed because otherwise one can press "I could" and "I 
            // can't" repeatedly, and each time his karma would be 
            // doubled without effort
            chat.employees[id].unpunish()
        })
        day.virdict = []
        day.punished = []
        candidateMust[day.name] = []
        candidateCould[day.name] = []
        day.getPretenders().forEach((id, indexId) => {
            if (day.getPreference(id) == 'must')
                candidateMust[day.name].push(id)
            if (day.getPreference(id) == 'could')
                candidateCould[day.name].push(id)
        })

        /*
        if (candidateCould[day.name].length + candidateMust[day.name].length > day.capacity)
            day.conflicts = true
        */

        var i = 0
        candidateMust[day.name].sort()
        seedrandom(chat.week.getTime() + 10 * indexDay, {global: true})
        candidateMust[day.name] = getRandomSubarray(
            candidateMust[day.name],
            candidateMust[day.name].length
        )
        while (day.remainingCapacity < candidateMust[day.name].length
        && i < candidateMust[day.name].length) {
            seedrandom(
                chat.week.getTime() + indexDay + parseInt(candidateMust[day.name][i]),
                {global: true}
            )
            if (chat.employees[candidateMust[day.name][i]].punish()) {
                day.punished.push(candidateMust[day.name].splice(i, 1)[0])
                anyPunished = true
            } else
                i++
        }
        if (candidateMust[day.name].length > day.remainingCapacity)
            seedrandom(
                chat.week.getTime() + indexDay * indexDay,
                {global: true}
            )
            candidateMust[day.name] = getRandomSubarray(
                candidateMust[day.name],
                day.remainingCapacity
            )
        day.addLuckyBastards(candidateMust[day.name])
        for (var i = 0; i < candidateMust[day.name].length; i++)
            nAssigned[candidateMust[day.name][i]]++
        candidateMust[day.name] = []

        if (candidateCould[day.name].length
        && candidateCould[day.name].length <= day.remainingCapacity) {
            day.addLuckyBastards(candidateCould[day.name])
            for (var i = 0; i < candidateCould[day.name].length; i++)
                nAssigned[candidateCould[day.name][i]]++
            candidateCould[day.name] = []
        }
    })

    // hard decisions
    seedrandom(chat.week.getTime(), {global: true})
    chat.getRandomDays().forEach((day, indexDay) => {
        if (candidateCould[day.name].length == 0 || day.remainingCapacity == 0)
            return
        // sort the candidates in ascending order of nAssigned (settle 
        // spares at random)
        var n = 0
        while (day.remainingCapacity && n <= chat.slots.length) {
            var newCandidateCould = []
            candidateCould[day.name].forEach((id, indexId) => {
                if (nAssigned[id] == n)
                    newCandidateCould.push(id)
            })
            if (newCandidateCould.length) {
                newCandidateCould.sort()
                seedrandom(
                    chat.week.getTime() + indexDay - chat.slots.length - n,
                    {global: true}
                )
                newCandidateCould = getRandomSubarray(
                    newCandidateCould,
                    newCandidateCould.length
                )
            }
            while (day.remainingCapacity && newCandidateCould.length) {
                seedrandom(
                    chat.week.getTime() + indexDay - parseInt(newCandidateCould[0]),
                    {global: true}
                )
                if (day.remainingCapacity < candidateCould[day.name].length
                && chat.employees[newCandidateCould[0]].punish()) {
                    anyPunished = true
                    candidateCould[day.name].splice(
                        candidateCould[day.name].indexOf(newCandidateCould[0]),
                        1
                    )
                    day.punished.push(newCandidateCould.splice(0, 1)[0])
                } else {
                    candidateCould[day.name].splice(
                        candidateCould[day.name].indexOf(newCandidateCould[0]),
                        1
                    )
                    nAssigned[newCandidateCould[0]]++
                    day.virdict.push(newCandidateCould.splice(0, 1)[0])
                    day.remainingCapacity--
                }
            }
            n++
        }
    })

    // judgements
    chat.getDays().forEach((day, indexDay) => {
        chat.judgements[day.end] = new Judgement(
            day.start,
            day.end,
            indexDay,
            day.name,
            day.virdict
        )
    })

    s += "\n\n*Virdict*"
    chat.getDays().forEach((day, indexDay) => {
        s += "\n_" + day.name + "_: "
        day.virdict.forEach((id, index) => {
            s += chat.employees[id].name
            if (index < day.virdict.length - 1)
                s += ', '
        })
    })

    if (anyPunished) {
        s += "\n\n*Punishments*\n"
        chat.getDays().forEach((day, indexDay) => {
            if (day.punished.length) {
                s += "On _" + day.name + "_, "
                day.punished.forEach((id, index) => {
                    s += chat.employees[id].name
                    if (index < day.punished.length - 2)
                        s += ', '
                    else if (index < day.punished.length - 1)
                        s += ' and '
                })
                if (day.punished.length > 1)
                    s += " have "
                else
                    s += " has "
                s += "been punished by karma. "
            }
        })
        s += "Sorry about that."
    }

    s += "\n\nRemember that Minos is watching you!"
    return s
}

// restore the status
const statusFile = __dirname + "/status.json"
console.log(statusFile)
try {
    var parsedChats = JSON.parse(fs.readFileSync(statusFile))
    var chats = {}
    Object.keys(parsedChats).forEach((id, index) => {
        logger.info("Reading chat " + id + " from status file")
        chats[id] = new Chat(id)
        chats[id].week = new Date(parsedChats[id].week)
        chats[id].previousMessage = parsedChats[id].previousMessage
        chats[id].addToCalendar = parsedChats[id].addToCalendar
        if (parsedChats[id].employees != null)
            Object.keys(parsedChats[id].employees).forEach((person, indexPerson) => {
                var tmp = new Employee(
                    parsedChats[id].employees[person].id,
                    parsedChats[id].employees[person].username,
                    parsedChats[id].employees[person].first_name,
                    parsedChats[id].employees[person].last_name
                )
                tmp.name = parsedChats[id].employees[person].name
                tmp.karma = parsedChats[id].employees[person].karma
                chats[id].employees[person] = tmp
            })
        if (parsedChats[id].slots != null)
            parsedChats[id].slots.forEach((day, indexDay) => {
                var tmp = new Slot(
                    day.id,
                    day.name,
                    day.start,
                    day.end
                )
                tmp.capacity = day.capacity
                tmp.remainingCapacity = day.remainingCapacity
                tmp.preferences = day.preferences
                tmp.virdict = day.virdict
                tmp.punished = day.punished
                chats[id].slots[indexDay] = tmp
            })
        if (parsedChats[id].judgements != null)
            Object.keys(parsedChats[id].judgements).forEach((judgement, index) => {
                var tmp = new Judgement(
                    parsedChats[id].judgements[judgement].start,
                    parsedChats[id].judgements[judgement].end,
                    parsedChats[id].judgements[judgement].index,
                    parsedChats[id].judgements[judgement].day,
                    parsedChats[id].judgements[judgement].virdict
                )
                chats[id].judgements[judgement] = tmp
            })
    })
} catch (error) {
    if (error.code == "ENOENT")
        var chats = {}
    else
        throw error
}

// bot

const bot = new Telegraf(botToken)

const intro = "<b>Greetings!</b>\n" + 
    "I am Minos, king of Crete, son of Zeus and Europa, " +
    "and judge of the underworld. In Dante's Inferno, " +
    "I examine the sins of the souls and decide in which circle " +
    "they should go. Here, I examine your preferences and decide " +
    "which days you should go to " + ROOM_NAME + ".\n\n"
const quickStart = "<b>Instructions</b>\n" +
    "Every week you should write the command /judge, then let me " +
    "know your preferences by tapping the buttons that will appear. " +
    "There are only a few places each day, so choose wisely. " +
    "If you do not go to the Office when expected, you will lose " +
    "/karma points and be penalised when there is competition " +
    "for a place. If you lose all of your karma, you will be offered " +
    "as a tribute to the Minotaur. Ask for /help anytime.\n\n"
const instructions = "<b>Judgement process</b>\n" +
    "Every week you should write the command /judge, then let me " +
    "know your preferences by tapping the buttons. There is one row of " +
    "buttons for each slot: monday morning, monday afternoon, tuesday " +
    "morning, ..., friday afternoon. Morning and afternoon are " +
    "abbreviated with 'am' and 'pm'. The meanings of " +
    "the buttons are roughly as follows.\n" + 
    "<i>I can't</i>: you cannot go to the Lab because you have a " +
    "class, a romantic date, or something not less important.\n" +
    "<i>I could</i>: you do not have anything better to do than " +
    "staying home watching Netflix, so you may well go to the Office " +
    "instead; however, if you did not go on this particular day it " +
    "would not be a tragedy.\n" +
    "<i>I must</i>: you cannot work from home or you have a meeting " +
    "with the Boss (or, alternatively, you have to feed the rat that " +
    "lives under your desk before it dies). In other words, it is " +
    "a matter of life or death.\n" +
    "I give precedence to those who choose 'I must' over those who " +
    "choose 'I could', but otherwise, being an impartial judge, " +
    "I try to make everybody as happy as possible. " +
    "Run-offs are settled by chance.\n\n"
const karma = "<b>Karma</b>\n" +
    "If I assign you a slot, then you <i>have to</i> go, otherwise " +
    "I will be very angry. If I notice that you did not go to the " +
    "Office when you were supposed to, you will lose karma points. " +
    "You start with " + INITIAL_KARMA + " karma points, which " +
    "are halved every time you do not show up when expected. " +
    "On the other hand, you can increase your karma by going to " +
    "the Office when it is your turn. " +
    "Consult the karma situation with the /karma command, and be " +
    "aware that if you lose all of your karma you will be offered " +
    "as a tribute to the Minotaur. " +
    "If you have a low karma, you are likely to lose the run-offs, " +
    "but if you are penalised " +
    "once for your loss of karma, I will not punish you again."

bot.catch((err, ctx) => {
    bot.telegram.sendMessage(myId, '!!Minos problem!!\n\n' + err.message)
    ctx.reply("Ooops, there was an internal error, sorry about that.")
    fs.writeFileSync(statusFile, JSON.stringify(chats, null, 2))
    logger.error(err)
    throw err
})
process.once('SIGINT', () => {
    fs.writeFileSync(statusFile, JSON.stringify(chats, null, 2))
    bot.stop('SIGINT')
    process.exit()
})
process.once('SIGTERM', () => {
    fs.writeFileSync(statusFile, JSON.stringify(chats, null, 2))
    bot.stop('SIGTERM')
    process.exit()
})

bot.on("message", (ctx, next) => {
    ctx.getChat().then((c) => {
        logger.debug("New message from " + c.id + ": " +
            ctx.update.message.text)
        if (Object.keys(chats).indexOf(String(c.id)) == -1) {
            logger.debug("This message comes from an unrecognised chat")
            if (Object.keys(chats).length) {
                logger.debug("There is already another chat in the world, ignoring")
                //ctx.reply("Sorry, there can be only one")
                return
            } else if (ctx.update.message.text == '/start') {
                return next()
            } else {
                ctx.reply("Psst! Say /start")
                return
            }
        }
        return next()
    })
})

bot.on("callback_query", (ctx, next) => {
    ctx.getChat().then((c) => {
        logger.debug("New cb query from " + c.id)
        if (Object.keys(chats).indexOf(String(c.id)) == -1) {
            logger.debug("This cb query comes from an unrecognised chat")
            //ctx.reply("Sorry, there can be only one")
            return
        }
        return next()
    })
})

bot.command('start', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.message.chat.id)
    chats[id] = new Chat(id)
    ctx.reply(intro + quickStart, {parse_mode: 'HTML'})
    logger.debug("Initialising new Chat for " + id)
    fs.writeFileSync(statusFile, JSON.stringify(chats, null, 2))
    return
})

bot.command('stop', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.message.chat.id)
    ctx.reply("OK, bye!")
    chats[id] = null
    logger.debug("Stopping for " + id)
    fs.writeFileSync(statusFile, JSON.stringify(chats, null, 2))
    return
})

bot.command('help', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    ctx.reply(intro + instructions + karma, {parse_mode: 'HTML'})
    return
})

bot.command('judge', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.message.chat.id)
    var monday = getNextMonday(new Date(), ROOM_DOOMSDAY)
    logger.debug("/judging for " + id)
    if (!chats[id].slots.length) {
        logger.debug("This is the first judgement")
        // first judgement
        chats[id].updateWeek(monday)
    } else if (chats[id].week.getTime() != monday.getTime()) {
        logger.debug("This is a new judgement after the apocalypse")
        // apocalypse has passed
        chats[id].updateWeek(monday)
        bot.telegram.editMessageReplyMarkup(
            id,
            chats[id].previousMessage,
            undefined,
            {
                inline_keyboard:[[
                    {
                        text: 'The apocalypse has already passed',
                        callback_data: 'expired'
                    }
                ]]
            }
        )
    } else {
        logger.debug("This is an updated judgement")
        // no apocalypse, just updating
        bot.telegram.editMessageReplyMarkup(
            id,
            chats[id].previousMessage,
            undefined,
            {
                inline_keyboard:[[
                    {
                        text: 'This judgement has expired',
                        callback_data: 'expired'
                    }
                ]]
            }
        )
    }

    if (TESTING) {
        chats[id].slots = []
        DAYS.forEach((day_id, index) => {
            var day_name = day_id.split('_').join(' ')
            day_name = day_name.charAt(0).toUpperCase() + day_name.slice(1)
            var day_index = index / 2 - index % 2
            var hour_start = index % 2 ? 14 : 9
            var hour_end = index % 2 ? 18 : 14
            chats[id].slots.push(new Slot(
                day_id,
                day_name,
                chats[id].week.getTime() + (day_index*24+hour_start)*60*60*1000,
                //chats[id].week.getTime() + (day_index*24+hour_end)*60*60*1000
                new Date().getTime() + 1000*60
            ))
        })
        //chats[id].slots[1].preferences = {"1": "must", "2": "must", "3": "could"}
        chats[id].slots[3].preferences = {"1": "could", "2": "could", "3": "could", "4": "could"}
        chats[id].slots[4].preferences = {"1": "could", "2": "could", "3": "could", "4": "could"}
        chats[id].slots[5].preferences = {"1": "could", "2": "could", "3": "could", "4": "could"}
        chats[id].slots[6].preferences = {"1": "could", "2": "could", "3": "could", "4": "could"}
        chats[id].slots[7].preferences = {"1": "could", "2": "could", "3": "could", "4": "could"}
        chats[id].slots[8].preferences = {"1": "could", "2": "could", "3": "could", "4": "could"}
        //chats[id].slots[9].preferences = {"1": "could", "2": "could", "3": "could", "4": "could", "5": "could"}
        chats[id].employees["1"] = new Employee(1, "ht", "ht", "t")
        chats[id].employees["2"] = new Employee(2, "lt", "lt", "t")
        chats[id].employees["3"] = new Employee(3, "rd", "rd", "d")
        chats[id].employees["4"] = new Employee(4, "rm", "rm", "m")
        chats[id].employees["5"] = new Employee(5, "gg", "gg", "g")
        chats[id].employees[myId] = new Employee(myId, "fm", "fm", "m")
        chats[id].employees["1"].karma = 1
        chats[id].employees["2"].karma = 2e-10
        chats[id].employees["3"].karma = 1
        chats[id].employees["4"].karma = 16
        chats[id].employees["5"].karma = 1
        chats[id].employees[myId].karma = 1
        console.log(chats)
    }

    ctx.reply(
        composeMessage(chats[id]),
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(calendarKeyboard)
        }
    ).then((m) => {
        chats[id].previousMessage = m.message_id
    })

    fs.writeFileSync(statusFile, JSON.stringify(chats, null, 2))
    return
})

bot.command('virdict', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.message.chat.id)
    var s = "<b>Virdict for the week of the " + chats[id].printNumericCurrentWeek() + "</b>"
    chats[id].getThisWeeksJudgements().forEach((judgement, index) => {
        s += "\n<i>" + judgement.day + "</i>: "
        judgement.virdict.forEach((person, indexPerson) => {
            s += chats[id].employees[person].name
            if (indexPerson < judgement.virdict.length - 1)
                s += ', '
        })
    })
    ctx.reply(s, {parse_mode: 'HTML'})
    return
})

bot.command('karma', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.message.chat.id)
    var s = "<b>Karma</b>\n"
    if (Object.keys(chats[id].employees).length) {
        Object.keys(chats[id].employees).forEach((key, index) => {
            s += chats[id].employees[key].name + " has " +
                Math.round(chats[id].employees[key].karma) + " karma points\n"
        })
    } else
        s += "There are no participants yet"
    ctx.reply(s, {parse_mode: 'HTML'})
    return
})

bot.action(/slot(\d+)_(.*)/, (ctx) => {
    var id = String(ctx.update.callback_query.message.chat.id)
    logger.debug("Setting preferences for " + id)
    if (chats[id].week.getTime() != getNextMonday(new Date(), ROOM_DOOMSDAY).getTime()) {
        logger.debug("We are past the apocalypse")
        ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
        ctx.answerCbQuery("I'm afraid I can't do that, Dave")
        ctx.editMessageReplyMarkup({
            inline_keyboard:[[
                {
                    text: 'The apocalypse has passed',
                    callback_data: 'expired_cb'
                }
            ]]
        })
        return
    }

    logger.debug("We are within the judgement period")
    if (ctx.match[2] == 'null') {
        ctx.answerCbQuery("Please don't press this button. It hurts")
    } else {
        ctx.answerCbQuery("On " + chats[id].slots[ctx.match[1]].name + ", " +
            "you " + ctx.match[2])
        logger.debug("Updating Employee " + ctx.from.first_name)
        chats[id].updateEmployee(ctx.from.id, ctx.from.username,
            ctx.from.first_name, ctx.from.last_name)
        if (chats[id].slots[ctx.match[1]].addPreference(
        String(ctx.from.id), ctx.match[2])) {
            ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
            ctx.editMessageText(
                composeMessage(chats[id]),
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(calendarKeyboard)
                }
            )
        }
    }
    fs.writeFileSync(statusFile, JSON.stringify(chats, null, 2))
    return
})

bot.action(/karma_(.+)_(\d+)_(.*)/, (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.callback_query.message.chat.id)
    ctx.answerCbQuery("Thank you for your cooperation")
    var s = "<b>Judgement hour</b>\n"
    if (ctx.match[3] == "yes") {
        chats[id].employees[ctx.match[1]].increaseKarma()
        s += "Good, " + chats[id].employees[ctx.match[1]].name +
            " was in the office on <i>" +
            chats[id].slots[ctx.match[2]].name + "</i>. His/her karma " +
            "is " + chats[id].employees[ctx.match[1]].karma
    } else {
        chats[id].employees[ctx.match[1]].decreaseKarma()
        s += "Oh no! " + chats[id].employees[ctx.match[1]].name +
            " was not in the office on <i>" +
            chats[id].slots[ctx.match[2]].name + "</i>. Now his/her " +
            "karma has dropped to " + chats[id].employees[ctx.match[1]].karma
    }
    ctx.editMessageText(s, {parse_mode: 'HTML'})
    return
})

bot.action('expired', (ctx) => {
    ctx.answerCbQuery("Please, use the latest judgement message")
    return
})

bot.action('expired_cb', (ctx) => {
    ctx.answerCbQuery("Please, say /judge")
    return
})

var apocalypseTimer = 1000 * 60 * 50
if (TESTING)
    apocalypseTimer = 1000 * 15
setInterval(function () {
    d = new Date()
    logger.debug("Tic, Toc...")
    Object.keys(chats).forEach((chat_id, indexChat) => {
    // send reminders of the apocalypse
    if (d.getTime() > chats[chat_id].getDoomsday().getTime() - 3*apocalypseTimer
    && d.getTime() < chats[chat_id].getDoomsday().getTime()
    && !chats[chat_id].addToCalendar) {
        bot.telegram.sendChatAction(chat_id, 'typing')
        var s = "<b>The end is near!</b>\n" +
            ROOM_APOCALYPSE_MESSAGE
        bot.telegram.sendMessage(chat_id, s, {parse_mode: "HTML"})
        chats[chat_id].addToCalendar = true
    }
    // add evenst to google calendar
    if (chats[chat_id].addToCalendar
    && d.getTime() > chats[chat_id].getDoomsday().getTime()) {
        logger.debug("Adding events to calendar")
        var events = []
        chats[chat_id].getJudgements().forEach((judgement, indexJudge) => {
            chats[chat_id].judgements[judgement].virdict.forEach((person, indexPerson) => {
                events.push({
                    'summary': chats[chat_id].employees[person].name,
                    'description': 'Event created by Minos (https://telegram.me/minosthebot)',
                    'start': {'dateTime': new Date(chats[chat_id].judgements[judgement].start)},
                    'end': {'dateTime': new Date(chats[chat_id].judgements[judgement].end)},
                })
            })
        })
        googlecalendar.addEvents(calId, events)
        chats[chat_id].addToCalendar = false
    }
    // send judgement messages
    chats[chat_id].getJudgements().forEach((judgement, indexJudge) => {
        if (d.getTime() > judgement) {
            var j = chats[chat_id].judgements[judgement]
            if (j.virdict != null && j.virdict.length) {
                bot.telegram.sendChatAction(chat_id, 'typing')
                for (var i = 0; i < j.virdict.length; i++) {
                    var s = "<b>Judgement hour</b>\n"
                    s += "Was @" +
                        chats[chat_id].employees[j.virdict[i]].username +
                        " in the office on <i>" + j.day + "</i>?"
                    bot.telegram.sendMessage(chat_id, s, {
                        parse_mode: "HTML",
                        ...Markup.inlineKeyboard([
                            Markup.button.callback(
                                "Yep",
                                "karma_" +
                                    j.virdict[i] +
                                    "_" +
                                    j.index +
                                    "_yes"),
                            Markup.button.callback(
                                "Nope",
                                "karma_" +
                                    j.virdict[i] +
                                    "_" +
                                    j.index +
                                    "_no")
                        ])
                    })
                }
            }
            delete chats[chat_id].judgements[judgement]
            fs.writeFileSync(statusFile, JSON.stringify(chats, null, 2))
        }
    })
    })
}, apocalypseTimer)

bot.launch()
logger.info("Minos is judging!")

// easter eggs

/*
bot.on('sticker', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    console.log(ctx.update.message.sticker)
    return ctx.reply('👍')
})
*/
bot.hears(/thank/i, (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    return ctx.telegram.sendSticker(ctx.chat.id, 'CAACAgIAAxkBAAIB7GBsVCcyr9TLMaSQnjkoa7aRi5mmAAJPCAACCLcZAvm72tmVH89bHgQ')
})
bot.hears(/grazie/i, (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    return ctx.telegram.sendSticker(ctx.chat.id, 'CAACAgIAAxkBAAIB7GBsVCcyr9TLMaSQnjkoa7aRi5mmAAJPCAACCLcZAvm72tmVH89bHgQ')
})
bot.hears(/ahaha/i, (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    return ctx.telegram.sendSticker(ctx.chat.id, 'CAACAgIAAxkBAAIB6WBsU-UXVMt0nru4mh5mQM0p0XDrAAI_CAACCLcZAt3Doz_J4ffTHgQ')
})

// helper functions

function getRandomSubarray(arr, size) {
    var shuffled = arr.slice(0), i = arr.length, temp, index;
    while (i--) {
        index = Math.floor((i + 1) * Math.random());
        temp = shuffled[index];
        shuffled[index] = shuffled[i];
        shuffled[i] = temp;
    }
    return shuffled.slice(0, size);
}

function getNextMonday(d, doomsday) {
    d = new Date(d)
    // if it's past the apocalypse, go to next week
    d = new Date(d.getTime() - doomsday)
    var day = d.getDay()
    var diff = d.getDate() - day + (day == 0 ? -6 : 1) + 7
    d.setHours(0)
    d.setMinutes(0)
    d.setSeconds(0)
    d.setMilliseconds(0)
    //if (TESTING)
        //return new Date(new Date().getTime() + 1000*30)
    return new Date(d.setDate(diff))
}
