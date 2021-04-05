const fs = require("fs")
const { Telegraf, Markup } = require("telegraf")
const seedrandom = require("seedrandom")

const ROOM_CAPACITY = 3
const ROOM_NAME = "the Sacred Office of Paolo Provero"
const DAYS = [
    'mon_am', 'mon_pm',
    'tue_am', 'tue_pm',
    'wed_am', 'wed_pm',
    'thu_am', 'thu_pm',
    'fri_am', 'fri_pm'
]
const INITIAL_KARMA = 128

class Employee {
    constructor(username, name) {
        this.username = username
        this.name = name
        this.karma = INITIAL_KARMA
        this.n_assigned = 0
    }
    punish() {
        if (INITIAL_KARMA*Math.random() > this.karma) {
            this.karma *= 2
            this.karma = Math.min(this.karma, INITIAL_KARMA)
            return true
        }
        return false
    }
    increaseKarma() {
        this.karma += 10
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
        this.candidateMust = [] // array with who must go
        this.candidateCould = [] // array with who could go
        this.virdict = [] // array with max three names
        this.judged = false
    }
    addPreference(id, username, name, what, employees) {
        // add this employee to the registry
        if (employees[id] == null)
            employees[id] = new Employee(username, name)
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
    addLuckyBastards(lb, employees) {
        this.virdict = this.virdict.concat(lb)
        this.remainingCapacity -= lb.length
        for (var i = 0; i < lb.length; i++)
            employees[lb[i]].n_assigned++
    }
}

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

composeMessage = function(slots, employees, week) {
    var s = "*Week of the " +
        week.toLocaleString(
            'en-GB',
            {year: 'numeric', month: 'numeric', day: 'numeric' }
        ) + "*\n"
    s += "Thou shalt now be judged for the week starting on " +
        week.toLocaleString(
            'en-GB',
            {weekday: 'long', month: 'long', day: 'numeric' }
        ) + ". Confess your preferences " +
        "by tapping the buttons below and I shall decide when you " +
        "can enter the Office. You have time until " +
        new Date(week.getTime() - 3*24*60*60*1000).toLocaleString(
            'en-GB',
            {weekday: 'long', month: 'long', day: 'numeric' }
        ) + " at noon to change your preferences. Then, the apocalypse " +
        "will come and you will be permanently judged, for this week.\n"

    s += "\n*Confessions*"
    slots.forEach((day, indexDay) => {
        s += "\n_" + day.name + "_: "
        day.getPretenders().forEach((id, index) => {
            s += employees[id].name + ' ' + day.getPreference(id)
            if (index < day.getPretenders().length - 1)
                s += ', '
        })
    })
 
    // reset the previous decisions
    Object.keys(employees).forEach((id, index) => {
        employees[id].n_assigned = 0
    })

    // easy decisions
    slots.forEach((day, indexDay) => {
        day.remainingCapacity = day.capacity
        day.virdict = []
        day.candidateMust = []
        day.candidateCould = []
        day.getPretenders().forEach((id, indexId) => {
            if (day.getPreference(id) == 'must')
                day.candidateMust.push(id)
            if (day.getPreference(id) == 'could')
                day.candidateCould.push(id)
        })
        var i = 0
        while (day.candidateMust.length > day.remainingCapacity
        && i < day.candidateMust.length) {
            seedrandom(
                week + indexDay + day.candidateMust[i],
                { global: true }
            )
            if (employees[day.candidateMust[i]].punish())
                day.candidateMust.splice(i, 1)
            else
                i++
        }
        if (day.candidateMust.length > day.remainingCapacity)
            day.candidateMust = getRandomSubarray(
                day.candidateMust,
                day.remainingCapacity
            )
        day.addLuckyBastards(day.candidateMust, employees)
        day.candidateMust = []

        // Let the bad luck strike for the candidate coulds
        var i = 0
        while (day.candidateCould.length > day.remainingCapacity
        && i < day.candidateCould.length) {
            seedrandom(
                week + indexDay - day.candidateMust[i],
                { global: true }
            )
            if (employees[day.candidateCould[i]].punish())
                day.candidateCould.splice(i, 1)
            else
                i++
        }
        if (day.candidateCould.length
        && day.candidateCould.length <= day.remainingCapacity) {
            day.addLuckyBastards(day.candidateCould, employees)
            day.candidateCould = []
        }
    })

    // hard decisions
    seedrandom(week, { global: true })
    getRandomSubarray(slots, slots.length).forEach((day, indexDay) => {
        if (day.candidateCould.length && day.remainingCapacity) {
            // sort the candidates in ascending order of n_assigned 
            // (settle spares at random)
            var i = 0
            while (day.remainingCapacity && i <= slots.length) {
                seedrandom(
                    week + day.name - slots.length - i,
                    { global: true }
                )
                var newCandidateCould = []
                day.candidateCould.forEach((id, indexId) => {
                    if (employees[id].n_assigned == i)
                        newCandidateCould.push(id)
                })
                newCandidateCould.sort()
                if (newCandidateCould.length) {
                    var howMany = Math.min(
                        newCandidateCould.length,
                        day.remainingCapacity
                    )
                    var newCould = getRandomSubarray(
                        newCandidateCould,
                        howMany
                    )
                    day.virdict = day.virdict.concat(newCould)
                    day.remainingCapacity -= howMany
                    for (var j = 0; j < newCould.length; j++) {
                        employees[newCould[j]].n_assigned++
                        day.candidateCould.splice(
                            day.candidateCould.indexOf(newCould[j]),
                            1
                        )
                    }
                }
                i++
            }
        }
    })

    s += "\n\n*Virdict*"
    slots.forEach((day, indexDay) => {
        s += "\n_" + day.name + "_: "
        day.virdict.forEach((id, index) => {
            s += employees[id].name
            if (index < day.virdict.length - 1)
                s += ', '
        })
    })

    s += "\n\nRemember that Minos and the Minotaur are watching you!"
    return s
}


/* BOT */

const bot_token = '1633438178:AAEmJKf7gi_R-Jzz8ggO7xRo0ZUqe7DFENs'
const bot = new Telegraf(bot_token)
const my_id = '128294952'
const statusFile = '/home/fmarotta/minos/status.json'

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
    "If you do not go to the Laboratory when expected, you will lose " +
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
    "staying home watching Netflix, so you may well go to the Lab " +
    "instead; however, if you did not go on this particular day it " +
    "would not be a tragedy.\n" +
    "<i>I must</i>: you cannot work from homo or you have the one:one " +
    "with Paolo (or, alternatively, you have to feed the rat that " +
    "lives under your desk before it dies). In other words, it is " +
    "a matter of life or death.\n" +
    "I give precedence to those who choose 'I must' over those who " +
    "choose 'I could', but otherwise, being an impartial judge, " +
    "I try to make everybody as happy as possible. " +
    "Run-offs are settled by chance.\n\n"
const karma = "<b>Karma</b>\n" +
    "If I assign you a slot, then you <i>have to</i> go, otherwise " +
    "I will be very angry. If I notice that you did not go to the " +
    "Lab when you were supposed to, you will lose karma points. " +
    "You start with " + INITIAL_KARMA + " karma points, which " +
    "are halved every time you do not show up when expected. " +
    "On the other hand, you can increase your karma by going to " +
    "the Lab when it is your turn. " +
    "Consult the karma situation with the /karma command, and be " +
    "aware that if you lose all of your karma you will be offered " +
    "as a tribute to the Minotaur. " +
    "If you have a low karma, you are likely to lose the run-offs, " +
    "but if you are penalised " +
    "once for your loss of karma, I will not punish you again."

// restore the status
try {
    var chats = JSON.parse(fs.readFileSync(statusFile))
    Object.keys(chats).forEach((id, index) => {
        Object.keys(chats[id].employees).forEach((person, indexPerson) => {
            var tmp = new Employee(
                chats[id].employees[person].username,
                chats[id].employees[person].name
            )
            tmp.karma = chats[id].employees[person].karma
            tmp.n_assigned = chats[id].employees[person].n_assigned
            chats[id].employees[person] = tmp
        })
        chats[id].slots.forEach((day, indexDay) => {
            var tmp = new Slot(
                day.id,
                day.name,
                day.start,
                day.end
            )
            tmp.capacity = day.capacity
            tmp.remainingCapacity = day.remainingCapacity
            tmp.preferences = day.preferences
            tmp.candidateMust = day.candidateMust
            tmp.candidateCould = day.candidateCould
            tmp.virdict = day.virdict
            tmp.judged = day.judged
            chats[id].slots[indexDay] = tmp
        })
    })
} catch (error) {
    if (error.code == "ENOENT")
        var chats = {}
    else
        throw error
}

// Use like this:   throw new Error('Example error')
bot.catch((err, ctx) => {
    console.log(err)
    bot.telegram.sendMessage(my_id, '!!Minos problem!!\n\n' + err.message)
    ctx.reply("Ooops, there was an internal error, sorry about that.")
    fs.writeFileSync(statusFile, JSON.stringify(chats))
    throw err
})
process.once('SIGINT', () => {
    fs.writeFileSync(statusFile, JSON.stringify(chats))
    bot.stop('SIGINT')
    process.exit()
})
process.once('SIGTERM', () => {
    fs.writeFileSync(statusFile, JSON.stringify(chats))
    bot.stop('SIGTERM')
    process.exit()
})

bot.on("message", (ctx, next) => {
    ctx.getChat().then((c) => {
        if (Object.keys(chats).indexOf(String(c.id)) == -1) {
            if (Object.keys(chats).length) {
                ctx.reply("Sorry, there can be only one")
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
        if (Object.keys(chats).indexOf(String(c.id)) == -1) {
            ctx.reply("Sorry, there can be only one")
            return
        }
        return next()
    })
})

bot.command('start', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.message.chat.id)
    chats[id] = {}
    chats[id].slots = []
    chats[id].employees = {}
    ctx.reply(intro + quickStart, {parse_mode: 'HTML'})
    fs.writeFileSync(statusFile, JSON.stringify(chats))
    return
})

bot.command('stop', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.message.chat.id)
    ctx.reply("OK, bye!")
    chats[id] = null
    fs.writeFileSync(statusFile, JSON.stringify(chats))
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
    chats[id].week = getNextMonday(new Date())
    if (chats[id].previousMessage != null) {
        bot.telegram.deleteMessage(id, chats[id].previousMessage)
    }

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
            chats[id].week.getTime() + (day_index*24+hour_end)*60*60*1000
        ))
    })

    ctx.reply(
        composeMessage(
            chats[id].slots,
            chats[id].employees,
            chats[id].week
        ),
        {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(calendarKeyboard)
        }
    ).then((m) => {
        chats[id].previousMessage = m.message_id
    })

    fs.writeFileSync(statusFile, JSON.stringify(chats))
    return
})

bot.command('karma', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.message.chat.id)
    var s = "<b>Karma</b>\n"
    if (Object.keys(chats[id].employees).length) {
        Object.keys(chats[id].employees).forEach((key, index) => {
            s += chats[id].employees[key].name + " has " +
                chats[id].employees[key].karma + " karma points\n"
        })
    } else
        s += "There are no participants yet"
    return ctx.reply(s, {parse_mode: 'HTML'})
})

bot.action(/slot(\d+)_(.*)/, (ctx) => {
    var id = String(ctx.update.callback_query.message.chat.id)
    if (chats[id].week.getTime() != getNextMonday(new Date()).getTime()) {
        ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
        ctx.answerCbQuery("I'm afraid I can't do that, Dave")
        ctx.editMessageText("<b>Goodbye</b>\n" +
            "Dave, this conversation can serve no purpose anymore. " +
            "This message pertained to last week: please say " +
            "/judge to be judged again for next week.",
            {parse_mode: "HTML"}
        )
        return
    }

    if (ctx.match[2] == 'null') {
        ctx.answerCbQuery("Please don't press this button. It hurts")
    } else {
        ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
        ctx.answerCbQuery("On " +
            chats[id].slots[ctx.match[1]].name + ", " +
            "you " + ctx.match[2])
        if (chats[id].slots[ctx.match[1]].addPreference(
                String(ctx.from.id),
                ctx.from.username,
                ctx.from.first_name + ' ' + ctx.from.last_name,
                ctx.match[2],
                chats[id].employees)) {
            ctx.editMessageText(
                composeMessage(
                    chats[id].slots,
                    chats[id].employees,
                    chats[id].week
                ),
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard(calendarKeyboard)
                }
            )
        }
    }
    fs.writeFileSync(statusFile, JSON.stringify(chats))
    return
})

bot.action(/karma_(.+)_(\d+)_(.*)/, (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    var id = String(ctx.update.callback_query.message.chat.id)
    ctx.answerCbQuery("Thank you for your cooperation")
    var s = "<b>Judgement hour</b>\n"
    if (ctx.match[3] == "yes") {
        chats[id].employees[ctx.match[1]].increaseKarma()
        s += chats[id].employees[ctx.match[1]].name +
            " was in the office on <i>" +
            chats[id].slots[ctx.match[2]].name + "</i>"
    } else {
        chats[id].employees[ctx.match[1]].decreaseKarma()
        s += chats[id].employees[ctx.match[1]].name +
            " was not in the office on <i>" +
            chats[id].slots[ctx.match[2]].name + "</i>"
    }
    ctx.editMessageText(s, {parse_mode: 'HTML'})
})

var apocalypse = setInterval(function () {
    d = new Date()
    Object.keys(chats).forEach((chat_id, indexChat) => {
    chats[chat_id].slots.forEach((day, indexDay) => {
        if (!day.judged && d.getTime() > day.end) {
            if (day.virdict.length) {
                bot.telegram.sendChatAction(chat_id, 'typing')
                for (var i = 0; i < day.virdict.length; i++) {
                    var s = "<b>Judgement hour</b>\n"
                    s += "Was @" +
                        chats[chat_id].employees[day.virdict[i]].username +
                        " in the office on <i>" + day.name + "</i>?"
                    bot.telegram.sendMessage(chat_id, s, {
                        parse_mode: "HTML",
                        ...Markup.inlineKeyboard([
                            Markup.button.callback(
                                "Yep",
                                "karma_" +
                                    day.virdict[i] +
                                    "_" +
                                    indexDay +
                                    "_yes"),
                            Markup.button.callback(
                                "Nope",
                                "karma_" +
                                    day.virdict[i] +
                                    "_" +
                                    indexDay +
                                    "_no")
                        ])
                    })
                }
            }
            day.judged = true
            fs.writeFileSync(statusFile, JSON.stringify(chats))
        }
    })
    })
}, 1000 * 15)


/*
bot.telegram.getUpdates(offset = 551022623700291421).then(
    bot.launch()
)
*/
bot.launch()
console.log("Minos is judging!")


/*
bot.on('sticker', (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    return ctx.reply('👍')
})
bot.hears(/thank/i, (ctx) => {
    ctx.telegram.sendChatAction(ctx.chat.id, 'typing')
    return ctx.telegram.sendSticker(ctx.chat.id, 'CAADAgADAgQAAtJaiAECKCdNruu1MQI')
})
*/


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

function getNextMonday(d) {
    d = new Date(d)
    // if it's past friday at noon, go to next week
    if (d.getDay() == 0 || d.getDay() > 5 || d.getDay() == 5 && d.getHours() > 12)
        d = new Date(d.getTime() + 3*24*60*60*1000)
    var day = d.getDay()
    var diff = d.getDate() - day + (day == 0 ? -6:1) + 7
    d.setHours(0)
    d.setMinutes(0)
    d.setSeconds(0)
    d.setMilliseconds(0)
    return new Date(d.setDate(diff))
}
