const { DbUtils, renderScoreAPL } = require('../utils');
const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

const { checkGameStarted, chooseMinigame, updateMultipleWinnersScore } = require('../responses');
const showVeoVeo = require('../documents/showVeoVeo.json');

const RoomObjects = [
    'taburete', 'mesa', 'silla', 'libro', 'lapicero', 'estatuilla', 'lampara', 'planta', 'macetero','cuadro', 'cama',
    'ventana', 'persiana', 'cajones', 'armario', 'almohada', 'edredon', 'manta', 'cojín', 'repisa', 'alfombra',
    'esterilla', 'bandeja', 'vela', 'jarron', 'cuenco', 'taza', 'libreta', 'tablet', 'difusor', 'puerta'
];
  

const veoVeoPhrases = [
    name => `¡Correcto! Excelente, tu turno, ${name}!`,
    name => `¡Muy bien! Atento, ${name}! ¿Qué ves?`,
    name => `¡Bravo! Sigue tú, ${name}, a ver si ves algo nuevo!`,
    name => `¡Genial! Veo veo, ${name}! Dime tu objeto.`,
    name => `¡Fantástico! Vamos ${name}, sorpréndenos con un objeto!`,
    name => `¡Impresionante! Tu turno, ${name}! ¿Qué ves?`,
    name => `¡Bien hecho! Adelante ${name}, a ver qué ves!`
];

function getRandomveoVeoPhrases(name) {
    const index = Math.floor(Math.random() * veoVeoPhrases.length);
    const phraseFn = veoVeoPhrases[index];
    return phraseFn(name);
}

const canonicalMap = RoomObjects.reduce((map, obj) => {
    const key = obj.normalize('NFD').replace(/[̀-\u036f]/g, '').toLowerCase();
    map[key] = obj;
    return map;
}, {});

function normalizeObject(rawSlotValue) {
    const raw = rawSlotValue ? rawSlotValue.trim().toLowerCase() : '';
    const key = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const canonical = canonicalMap[key];
    return { raw, canonical, valid: !!canonical };
}

function initializeGameSession(sessionAttributes) {
    if (!sessionAttributes.activePlayers) {
        sessionAttributes.activePlayers = [...sessionAttributes.originalPlayers];
    }
    sessionAttributes.usedObjects = sessionAttributes.usedObjects || [];
}

function promptForObject(handlerInput, playerName) {
    return handlerInput.responseBuilder
        .speak(`No he escuchado ningún objeto. ${playerName}, por favor, nombra un objeto.`)
        .reprompt(`${playerName}, por favor, di el nombre de un objeto.`)
        .getResponse();
}

function handleIncorrectGuess(handlerInput, sessionAttributes, turno, jugadores, isKnownObject) {
    const playerName = jugadores[turno].name;
    const speakOutput = isKnownObject
        ? `Ese objeto ya fue dicho.`
        : `Ese objeto no forma parte de la habitación.`;

    jugadores.splice(turno, 1);
    sessionAttributes.activePlayers = jugadores;

    if (jugadores.length === 1) {
        const winner = jugadores[0];
        sessionAttributes.winner = winner;
        resetVeoVeoSession(sessionAttributes);

        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        renderScoreAPL(sessionAttributes, handlerInput);

        return handlerInput.responseBuilder
            .speak(`
                <speak>
                <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
                ${speakOutput} ¡${winner.name} es el ganador del Veo Veo! Tira el dado para ver cuántas casillas avanzas.
                </speak>    
            `)
            .reprompt(`¡${winner.name}, tira el dado para ver cuántas casillas avanzas!`)
            .getResponse();
    }

    turno = turno % jugadores.length;
    sessionAttributes.turnoActual = turno;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    const nextName = jugadores[turno].name;
    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            ${speakOutput} Turno de ${nextName}.
            </speak>    
        `)
        .reprompt(`Turno de ${nextName}, di un objeto.`)
        .getResponse();
}

function resetVeoVeoSession(sessionAttributes) {
    sessionAttributes.activePlayers = undefined;
    sessionAttributes.turnoActual = undefined;
    sessionAttributes.usedObjects = undefined;
}

function renderAPL(sessionAttributes, handlerInput, guessed) {
    const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
    if (apl) {
        if(sessionAttributes.firstTurn){
            console.log('Entra en el creador')
            sessionAttributes.firstTurn = undefined;
            handlerInput.responseBuilder.addDirective({
                type: 'Alexa.Presentation.APL.RenderDocument',
                version: '1.6',
                token: 'veoVeoBoard',
                document: showVeoVeo,
                datasources: {
                    veoVeoData: {
                      object: guessed.canonical,
                    }
                }
            });
        } else{
            console.log('Entra en el actualizador')
            const usedObjects = sessionAttributes.usedObjects.join(', ');
            console.log('usedObjects', usedObjects)
            handlerInput.responseBuilder.addDirective({
                type: 'Alexa.Presentation.APL.ExecuteCommands',
                token: 'veoVeoBoard',
                commands: [
                    { type: 'SetValue', componentId: 'veoveoText', property: 'text', value: `¡No repitas los objetos mencionados! ->  ${usedObjects}` },
                ]
            });
        }
    }
}

async function veoVeoGame(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const guessed = normalizeObject(request.intent.slots?.objeto?.value);

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    initializeGameSession(sessionAttributes);

    const jugadores = sessionAttributes.activePlayers;
    let turno = sessionAttributes.turnoActual ?? 0;

    if (!guessed.raw) {
        return promptForObject(handlerInput, jugadores[turno].name);
    }

    if (!guessed.valid || sessionAttributes.usedObjects.includes(guessed.canonical)) {
        return handleIncorrectGuess(handlerInput, sessionAttributes, turno, jugadores, guessed.valid);
    }

    sessionAttributes.usedObjects.push(guessed.canonical);
    renderAPL(sessionAttributes, handlerInput, guessed);

    if (sessionAttributes.usedObjects.length === RoomObjects.length) {
        resetVeoVeoSession(sessionAttributes);
        return await updateMultipleWinnersScore(sessionAttributes, handlerInput, 4);
    }

    turno = (turno + 1) % jugadores.length;
    sessionAttributes.turnoActual = turno;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    const speakOutput = getRandomveoVeoPhrases(jugadores[turno].name);
    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(`${jugadores[turno].name}, tu turno.`)
        .getResponse();
}

module.exports = { veoVeoGame };
