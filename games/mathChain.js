const { DbUtils, SessionUtils, renderScoreAPL } = require('../utils');
const { checkGameStarted, chooseMinigame } = require('../responses');
const showMathChain = require('../documents/showMathChain.json');

const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

const mathChainPhrases = [
    name => `¡Muy bien! ¡Vamos ${name}, es tu turno!`,      
    name => `¡Correcto! ¡Le toca a ${name} seguir la cadena!`,
    name => `¡Has acertado! ¡${name}, a calcular!`,
    name => `¡Atención, ${name} sigue la cadena!`,
    name => `¡Muy bien! Turno de ${name}. ¡Vamos!`,
    name => `¡Correcto! ¡Ey ${name}! ¡Es el momento de la verdad!`,
];

function getRandommathChainPhrases(name) {
    const index = Math.floor(Math.random() * mathChainPhrases.length);
    const phraseFn = mathChainPhrases[index];
    return phraseFn(name);
}

function handleMissingMathAnswer(handlerInput) {
    console.log('No se recibió respuesta del usuario.');
    return handlerInput.responseBuilder
        .speak("No entendí tu respuesta. Por favor, di el resultado de la operación.")
        .reprompt("¿Cuál es el resultado de la operación?")
        .getResponse();
}

function supportsAPL(handlerInput) {
    return !!handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
}

function renderAPL(handlerInput, operation){
    const apl = supportsAPL(handlerInput);
    if (apl) {
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token: 'mathChainBoard',
            commands: [
                { type: 'SetValue', componentId: 'operationText', property: 'text', value: `¡Resuelve la operación! ➔ ${operation}` },
            ]
        });
    }
}

function handleIncorrectMathAnswer(handlerInput, sessionAttributes, turnoActual, playerAnswer, currentResult) {
    const jugadores = sessionAttributes.activePlayers;
    const eliminatedPlayer = jugadores[turnoActual];
    let speakOutput = `¡${playerAnswer} es incorrecto!. La respuesta correcta era ${currentResult}. ¡${eliminatedPlayer.name} estás eliminado! `;
    
    jugadores.splice(turnoActual, 1);
    sessionAttributes.activePlayers = jugadores;

    if (jugadores.length === 1) {
        return endGameWithWinner(handlerInput, sessionAttributes, speakOutput);
    }

    if (turnoActual >= jugadores.length) {
        turnoActual = 0;
    }

    const newCalc = generateNewCalculation(currentResult);
    sessionAttributes.currentResult = newCalc.result;
    sessionAttributes.currentCalculationText = newCalc.text;
    sessionAttributes.turnoActual = turnoActual;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    renderAPL(handlerInput, newCalc.operation);

    speakOutput += `Le toca a ${jugadores[turnoActual].name}. ${newCalc.text} ¿Cuál es el resultado?`;
    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            ${speakOutput}
            </speak>    
        `)
        .reprompt(`Le toca a ${jugadores[turnoActual].name}. ${newCalc.text} ¿Cuál es el resultado?`)
        .getResponse();
}

function handleCorrectMathAnswer(handlerInput, sessionAttributes, turnoActual) {
    const jugadores = sessionAttributes.activePlayers;
    const currentResult = sessionAttributes.currentResult;
    const newCalc = generateNewCalculation(currentResult);
    
    sessionAttributes.currentResult = newCalc.result;
    sessionAttributes.currentCalculationText = newCalc.text;
    turnoActual = (turnoActual + 1) % jugadores.length;
    sessionAttributes.turnoActual = turnoActual;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    const siguienteJugador = jugadores[turnoActual];
    let speakOutput = getRandommathChainPhrases(siguienteJugador.name);
    speakOutput += `, ${newCalc.text}`;
    
    renderAPL(handlerInput, newCalc.operation);

    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
}

function endGameWithWinner(handlerInput, sessionAttributes, speakOutput) {
    const winner = sessionAttributes.activePlayers[0];
    speakOutput += `¡${winner.name} es el único jugador restante y ha ganado el juego! Tira el dado para ver cuántas casillas avanzas.`;

    sessionAttributes.activePlayers = undefined;
    sessionAttributes.turnoActual = undefined;
    sessionAttributes.currentResult = undefined;
    sessionAttributes.currentCalculationText = undefined;
    sessionAttributes.winner = winner;

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    renderScoreAPL(sessionAttributes, handlerInput);

    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            ${speakOutput}
            </speak>    
        `)
        .reprompt(`¡${winner.name} tira el dado!`)
        .getResponse();
}

async function mathChainGame(handlerInput) {
    console.log('Ejecutando mathChainGame');
    const request = handlerInput.requestEnvelope.request;
    const mathAnswer = request.intent.slots?.mathAnswer?.value;
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    let turnoActual = sessionAttributes.turnoActual || 0;

    if (!sessionAttributes.activePlayers) {
        sessionAttributes.activePlayers = [...sessionAttributes.originalPlayers];
        console.log('activePlayers no estaba definida, se inicializa:', sessionAttributes.activePlayers);
    }

    if (!mathAnswer) {
        return handleMissingMathAnswer(handlerInput);
    }

    const playerAnswer = parseFloat(mathAnswer);
    const currentResult = sessionAttributes.currentResult;
    const jugadores = sessionAttributes.activePlayers;

    if (playerAnswer !== currentResult) {
        return handleIncorrectMathAnswer(handlerInput, sessionAttributes, turnoActual, playerAnswer, currentResult);
    } else {
        return handleCorrectMathAnswer(handlerInput, sessionAttributes, turnoActual);
    }
}

function generateNewCalculation(currentResult) {
    const operations = ['+', '-', '*'];
    const op = operations[Math.floor(Math.random() * operations.length)];
    const num_sum = Math.floor(Math.random() * 30) + 1;
    const num_mult = Math.floor(Math.random() * 10) + 1;
    let result, text, operation;

    switch (op) {
        case '+':
            result = currentResult + num_sum;
            operation = `${currentResult} + ${num_sum}`;
            text = ` Súmale ${num_sum}. ¿Cuánto es ${currentResult} más ${num_sum}?`;
            break;
        case '-':
            result = currentResult - num_sum;
            operation = `${currentResult} - ${num_sum}`;
            text = ` Réstale ${num_sum}. ¿Cuánto es ${currentResult} menos ${num_sum}?`;
            break;
        case '*':
            result = currentResult * num_mult;
            operation = `${currentResult} * ${num_mult}`;
            text = ` Multiplícalo por ${num_mult}. ¿Cuánto es ${currentResult} multiplicado por ${num_mult}?`;
            break;
    }

    return { text, result, operation };
}

module.exports = { mathChainGame };
