const Steamclient = require('steam-user')
const puppeteer = require('puppeteer')
const Discord = require('discord.js')
const fs = require('fs')
const json = require('self-reload-json')
const log = require('read-last-lines');
const regLayout = new json('./layout.json')
const fillLayout = new json('./fill_layout.json')
const config = new json('./config.json')
const steam = new Steamclient()
const discord = new Discord.Client({autoReconnect:true})

let currentLayout = ['firstRun', 'regLayout', 'fillLayout']


steam.logOn()
steam.on('loggedOn', async() => {
    let conf = Object.entries(config).map(conf => {
        if(conf[1].toString() !== "[object Object]") {
            if(conf[1].length < 1) {
                console.log(`${getDateTime()}| ${conf[0]} not set!`)
            } else {
                return true
            }
        } else {
            var subConfig = Object.entries(conf[1]).map(subConf => {
                if(subConf[1].length < 1) {
                    console.log(`${getDateTime()}| ${conf[0]}: ${subConf[0]} not set!`)
                } else {
                    return true
                }
            })
            return subConfig.every(subConf => subConf === true)
        }
    })
    if(conf.every(conf => conf === true)) {
        discord.login(config.discord_token).catch(console.error);
        discord.once('ready', async () => {
            let playerCountTrend = [],
                currentMap = ['firstRun']

            console.log(`${getDateTime()}| Logged into Steam as ${steam.steamID.getSteam3RenderedID()}`);
            checkServerStatus(playerCountTrend, currentLayout, currentMap)
        })
    } else{
        console.log(`${getDateTime()}| please fill out every value in config.json`)
    }
});

async function checkServerStatus(playerCountTrend, currentLayout, currentMap) {
    let timeout = currentLayout[0] === 'firstRun' && playerCountTrend.length < 3 ? 60000 : currentLayout[0] === 'fillLayout' ? 900000 : 300000,
        date = new Date(),
        server

    setTimeout(() => {
        steam.getServerList('\\gamedir\\ro2', 60, async(err, servers) => {
            server = servers.length > 0 ? servers.find(server => server.addr.split(':')[0] === config.server_address) : {}
            if (err) {
                console.log(err)
            } else {
                if(currentMap[0] === 'firstRun') {
                    console.log(`${getDateTime()}| server: ${server.name}`)
                    currentMap.push(server.map)
                    currentMap.shift()
                }

                playerCountTrend.push(server.players)

                console.log(`${getDateTime()}| there are ${server.players} players on right now, and ${server.bots} bots`)
                if (playerCountTrend.length > 3) {

                    playerCountTrend.shift()
                    console.log(`${getDateTime()}| playerCountTrend: ${playerCountTrend}`)
                    let playerCountReg = atLeastTwo(playerCountTrend[0] >= config.layout_change_reqs.to_regular, playerCountTrend[1] >= config.layout_change_reqs.to_regular, playerCountTrend[2] >= config.layout_change_reqs.to_regular),
                        playerCountFill = atLeastTwo(playerCountTrend[0] <= config.layout_change_reqs.to_fill, playerCountTrend[1] <= config.layout_change_reqs.to_fill, playerCountTrend[2] <= config.layout_change_reqs.to_fill),
                        playerCountMapChange = atLeastTwo(playerCountTrend[0] !== 0, playerCountTrend[0] !== 0, playerCountTrend[0] !== 0),
                        currentTime = date.getDay() === 0 || date.getDay() === 6 ? (date.getHours() >= 1 && date.getHours() < 9) : (date.getHours() >= 0 && date.getHours() < 12)

                    if (playerCountReg && playerCountMapChange && (currentLayout[0] === 'fillLayout' || currentLayout[0] === 'firstRun') && !currentTime) {
                        console.log(`${getDateTime()}| switching to regular layout`)
                        currentLayout[0] === 'firstRun' ? currentLayout.shift() : null
                        currentLayout[0] === 'fillLayout' ? currentLayout.reverse() : null


                        await discord.user.setPresence({
                            game: {name: 'regular layout', type: 'WATCHING'},
                            status: 'online'
                        }).catch(console.error);

                        await changeLayout(regLayout)
                    } else if (((playerCountFill && playerCountMapChange) && (currentLayout[0] === 'regLayout' || currentLayout[0] === 'firstRun')) || (currentTime && (currentLayout[0] === 'regLayout' || currentLayout[0] === 'firstRun'))) {
                        console.log(`${getDateTime()}| switching to fill layout`)
                        currentLayout[0] === 'firstRun' ? currentLayout.shift() : null
                        currentLayout[0] === 'regLayout' ? currentLayout.reverse() : null


                        await discord.user.setPresence({ game: { name: 'fill layout', type: 'WATCHING' }, status: 'idle' }).catch(console.error);

                        await changeLayout(fillLayout)
                    } else {
                        console.log(`${getDateTime()}| no layout changes necessary`)
                    }

                    if(currentMap.length !== 0 && currentMap[0] !== server.map) {
                        console.log(`${getDateTime()}| map changed to: ${server.map}`)
                        currentMap.push(server.map)
                        currentMap.shift()
                    }
                }
            }
        })
        if ( discord.user.presence && discord.user.presence.status && discord.user.presence.status !== 'dnd') {
            checkServerStatus(playerCountTrend, currentLayout, currentMap)
        }
    }, timeout)
}

discord.on('disconnect', event => {
    console.log(`${getDateTime()}| disconnect error: ${event.code}`)
    setTimeout(() => {
        discord.login(config.discord_token).catch(console.error);
        console.log(`${getDateTime()}| logging back into discord`)
    }, 400000)
})

discord.on('reconnect', () => {
    console.log(`${getDateTime()}| attempting reconnect`)
})

discord.on('debug', info => {
    //console.log(`${getDateTime()}| debug: ${info}`)
})

discord.on('message', async message  => {
    if((message.channel.id === config.command_channel_id || message.channel.id === '675022637801537559') && message.content.indexOf('!') === 0) {
        const command = message.content.toString().split(' ')
        switch(command[0]) {
            case '!restart': {
                fs.writeFile('./layout.md', "test", () => {
                    console.log(`${getDateTime()}| restarting layoutSwitcher.js`)
                })
                message.channel.send('restarting the script!').catch(console.error);
            } break;
            case '!layout': {
                if(command.length > 1) {
                    if (command[1] === 'regular' && (currentLayout[0] !== 'regLayout' || currentLayout[0] === 'firstRun')) {
                        message.channel.send('switching to the regular layout!')
                        currentLayout[0] === 'firstRun' ? currentLayout.shift() : null
                        currentLayout[0] === 'fillLayout' ? currentLayout.reverse() : null
                        await changeLayout(regLayout)

                        await discord.user.setPresence({
                            game: {name: 'regular layout', type: 'WATCHING'},
                            status: 'online'
                        }).catch(console.error);
                    } else if (command[1] === 'regular') {
                        message.channel.send('the server is already running the regular layout').catch(console.error);
                    }
                    if (command[1] === 'fill' && (currentLayout[0] !== 'fillLayout' || currentLayout[0] === 'firstRun')) {
                        message.channel.send('switching to the fill layout!')
                        currentLayout[0] === 'firstRun' ? currentLayout.shift() : null
                        currentLayout[0] === 'regLayout' ? currentLayout.reverse() : null
                        await changeLayout(fillLayout)

                        await discord.user.setPresence({
                            game: {name: 'fill layout', type: 'WATCHING'},
                            status: 'idle'
                        }).catch(console.error);
                    } else if (command[1] === 'fill') {
                        message.channel.send('the server is already running the fill layout').catch(console.error);
                    }
                } else {
                    message.channel.send('please supply the following arguments {layout: regular, fill}').catch(console.error);
                }
            } break;
            case '!pause': {
                message.channel.send('pausing the layout switcher')
                discord.user.setPresence({ game: { name: 'layout', type: 'WATCHING' }, status: 'dnd' })
                    .catch(console.error);
            }break;
            case '!unpause': {
                message.channel.send('unpausing the layout switcher')

                if(currentLayout[0] !== 'regLayout' && currentLayout[0] !== 'firstRun') {
                    discord.user.setPresence({ game: { name: 'fill layout', type: 'WATCHING' }, status: 'idle' })
                        .catch(console.error);
                } if(currentLayout[0] !== 'fillLayout' && currentLayout[0] !== 'firstRun') {
                    discord.user.setPresence({ game: { name: 'fill layout', type: 'WATCHING' }, status: 'online' })
                        .catch(console.error);
                } else {
                    message.channel.send('error: the layout switcher is not paused')
                    discord.user.setPresence({ game: { name: 'layout', type: 'WATCHING' }, status: 'dnd' })
                        .catch(console.error);
                }
            } break;
            case '!log': {
                let lineCount = command.length > 1  && command[1] < 30 ? command[1] : 29
                const messageLimit = 2000

                log.read('./logfile.txt', lineCount)
                    .then((lines) => {
                        let length = lines.length
                        let messageCount = length > messageLimit ? (length - length % messageLimit) / messageLimit : 1

                        for (var i = 0; i < messageCount; i++) {
                            let messageCutoff = getMessageCutoff(lines, messageLimit, messageCount, length, i)
                            let messageEnd = i + 1 === messageCount ? messageCutoff + length % messageLimit : messageCutoff + messageLimit
                            let logMessage = lines.substr(messageCutoff, messageEnd).replace(/\\[([0-9]|([1-9][0-9])|100)m\[nodemon\]/g, `${getDateTime()}|`).replace(/\\[([0-9]|([1-9][0-9])|100)m/g, '')
                            message.channel.send('\`\`\`scala\n' + `${logMessage}` + '\`\`\`')
                        }
                    })
                    .catch(console.error);
            } break;
            case '!save': {
                if(command.length > 1) {
                    if (command[1] == 'regular' || command[1] == 'fill') {
                        saveLayout(command[1])
                        message.channel.send(`updated the ${command[1]} layout!`)
                    } else {
                        message.channel.send(`unrecognized parameter: ${command[1]}`)
                    }
                } else {
                    message.channel.send('please supply a valid argument: {regular, fill}')
                }
            } break;
            case '!layoutreqs': {
                if (command.length > 1) {
                    if (command[1] == 'regular' || command[1] == 'fill') {
                        if (command[2] && parseInt(command[2]) > 0 && parseInt(command[2]) < 69) {
                            let configJson = {
                                ...config,
                                layout_change_reqs: {...config.layout_change_reqs, [`to_${command[1]}`]: command[2]}
                            }
                            fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 4), 'utf8', () => {
                                console.log(`${getDateTime()}| updated the change requirements for the ${command[1]} layout`)
                            })
                            message.channel.send(`updated the change requirements for the ${command[1]} layout!`)
                        } else if (command[2]) {
                            message.channel.send(`command values: ${parseInt(command[2])}`)
                        } else {
                            message.channel.send(`please supply a valid argument: {playercount: number} | current command: ${command}`)
                        }
                    } else {
                        message.channel.send('please supply a valid first argument: {regular, fill}')
                    }
                } else {
                    message.channel.send('you can use the following arguments: {regular, fill} {playercount: number}')
                }
            } break;
            case '!config': {
                const options = Object.keys(config)
                if(command.length > 2) {
                    if(options.findIndex(key => key === command[1]) !== -1) {
                        if(command[2]) {
                            if(command[3]) {
                                let configJson = {
                                    ...config,
                                    webadmin_creds: {...config.webadmin_creds, username: command[2], password: command[3] }
                                }
                                fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 4), 'utf8', () => {
                                    console.log(`${getDateTime()}| updated the value of the ${command[1]}`)
                                })
                            } else if (command[2]) {
                                let configJson = {
                                    ...config,
                                    [`${command[1]}`]: command[2] }
                                fs.writeFileSync('./config.json', JSON.stringify(configJson, null, 4), 'utf8', () => {
                                    console.log(`${getDateTime()}| updated the change requirements for the ${command[1]}`)
                                })
                            }
                            message.channel.send(`updated the value of the ${command[1]}!`)
                        } else {
                            message.channel.send('invalid or undefined token!')
                        }
                    } else if(command[1] === 'options') {
                        message.channel.send(`you can change the following settings: ${options.join(', ')}`)
                    }
                }
            } break;
            case '!help': {
                message.channel.send('\`\`\`the following commands are available:\n' +
                    '\n' +
                    '!restart: restarts the script.\n' +
                    '!layout {regular, fill}: change the current layout.\n' +
                    '!log: prints the last 50 lines of the log file.\n' +
                    '!save {regular, fill}: saves the current layout to file.\n' +
                    '!pause: pause the layout changer.\n' +
                    '!unpause: unpause the layout changer.\n' +
                    '!layoutreqs {regular, fill} {playercount}: change the requirements for changing the layout./\n' +
                    '!config: configure the bot, see !config list for more info' +
                    '\`\`\`')
            }break;
            default: {
                message.channel.send(`\`\`\`unrecognized command, try something else ${message.author.username}\`\`\``)
            }
        }
    }
})

async function changeLayout(layout) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()
    const parsedLayout = Object.entries(layout).reverse()

    await page.goto(config.webadmin_address)
    await page.goto(config.webadmin_address)

    const currentUser = await page.$('.username')

    if (!currentUser.innerText) {
        console.log(`${getDateTime()}| not logged in`)

        await page.type('#username', config.webadmin_creds.username)
        await page.type('#password', config.webadmin_creds.password)

        const [response] = await Promise.all([
            page.waitForNavigation(),
            page.click('button'),
        ]);
        await response
    }
    console.log(`${getDateTime()}| logged in`)
    await page.click('#simpleEditBtn')

    await parsedLayout.forEach(async(territory, index) => {
        let territoryId = `sgterritory_${index}`,
            territoryString = territory[1].join('\n')

        await setSelectVal(page, `textarea[id^=${territoryId}]`, territoryString).catch(error => console.log(`Error setting textarea value: ${error}.`));
    })

    console.log(`${getDateTime()}| changed the layout`)
    await page.click(`button[name='save']`)
    await browser.close();
}

function atLeastTwo(a, b, c) {
    return a ? (b || c) : (b && c)
}

async function setSelectVal(page, sel, val) {
    page.evaluate((data) => {
        return document.querySelector(data.sel).value = data.val
    }, { sel, val })
}


function generateLayout(layoutString) {
    let sgIndex = -1,
        layoutJson = {},
        layoutArray = layoutString.split('\n')

    layoutArray.pop()
    layoutArray.shift()

    layoutArray.forEach(map => {
        if(map.length > 0) {
            if (!map.startsWith('TE-')) {
                sgIndex++
                layoutJson[`sg_territory_${sgIndex}`] = []
            } else {
                layoutJson[`sg_territory_${sgIndex}`].push(map)
            }
        }
    })
    return  JSON.stringify(layoutJson, null, 4)
}

async function saveLayout(layout) {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] })
    const page = await browser.newPage()

    await page.goto(config.webadmin_address)

    const currentUser = await page.$('.username')

    if (!currentUser.innerText) {
        console.log(`${getDateTime()}| not logged in`)

        await page.type('#username', config.webadmin_creds.username)
        await page.type('#password', config.webadmin_creds.password)

        const [response] = await Promise.all([
            page.waitForNavigation(),
            page.click('button'),
        ]);
        await response
    }
    console.log(`${getDateTime()}| logged in`)
    await page.click('#simpleEditBtn')

    const parseLayout = async() =>{
        return await page.evaluate(async () => {
            return Object.values(document.querySelectorAll(`[id^='sgterritory_']`)).map(territory => {
                let territoryArray = territory.value.split('\n')
                territoryArray.pop()
                return {[territory.name]: territoryArray}
            })
        })
    }

    const layoutObject = await parseLayout()
    console.log(`${getDateTime()}| parsed layout from page`)
    console.log(layout)

    if(layout === 'regular') {
        console.log('regular layout')
        fs.writeFileSync('./layout.json', JSON.stringify(layoutObject, null, 4), 'utf8', () => {
            console.log(`${getDateTime()}| updated the regular layout`)
        })
    } else {
        fs.writeFileSync('./fill_layout.json', JSON.stringify(layoutObject, null, 4), 'utf8', () => {
            console.log(`${getDateTime()}| updated the fill layout`)
        })
    }
    await page.click(`button[name='save']`)
    await browser.close();
}

function getMessageCutoff(logString, messageLimit, messageCount, length, i) {
    const messageStart = messageLimit * i
    const messageEnd = i + 1 === messageCount ?  messageLimit * i + length % messageLimit : messageLimit * i + messageLimit
    const lastNodeChar = logString.lastIndexOf('nodemon', messageStart , messageEnd)
    let firstLogLine

    if(lastNodeChar !== -1){
        firstLogLine = logString.indexOf('|', lastNodeChar, messageEnd) - 8
        return firstLogLine
    }
    return messageStart
}

function getDateTime() {
    const date = new Date(new Date().setHours(new Date().getHours() + 1))
    const dayMonth = date.toDateString().substr(0,10)

    if(new Date(new Date().setHours(date.getHours() - 1)).getDay() !== date.getDay()) {
        return `${dayMonth} ${date.toLocaleTimeString()}`
    } else {
        return `${date.toLocaleTimeString()}`
    }
}