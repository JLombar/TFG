const { DbUtils, renderScoreAPL } = require('../utils');

const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

const FizzBuzzPhrases = [
    name => `¡Muy bien! ¡Vamos ${name}, es tu turno!`,      
    name => `¡Has acertado! ${name}, ¿qué toca ahora?`,
    name => `¡Muy bien! Turno de ${name}. ¡Vamos!`,
    name => `¡Correcto! ¡Ey ${name}! ¡Es el momento de la verdad!`,
    name => `¡Eso es! ¡Bien hecho, ${name}! Te toca.`,
    name => `¡Perfecto! Ahora sigue tú, ${name}.`,
    name => `¡Así se hace! ¡Adelante, ${name}!`,
    name => `¡Excelente! ${name}, ¿puedes con el siguiente?`,
    name => `¡Sí señor! Vamos ${name}, sigue el ritmo.`,
    name => `¡Impecable! ${name}, es tu momento.`,
    name => `¡Qué máquina! A ver qué dices tú, ${name}.`,
    name => `¡Justo lo que esperaba! ${name}, es tu turno.`,
    name => `¡Genial! Ahora le toca a ${name}, no lo arruines.`,
];

function getRandomFizzBuzzPhrases(name) {
    const index = Math.floor(Math.random() * FizzBuzzPhrases.length);
    const phraseFn = FizzBuzzPhrases[index];
    return phraseFn(name);
}

function fizzBuzz(number) {
    if (number % 3 === 0 && number % 5 === 0) {
        return "FizzBuzz";
    } else if (number % 3 === 0) {
        return "Fizz";
    } else if (number % 5 === 0) {
        return "Buzz";
    } else {
        return number.toString();
    }
}

function isFizzBuzzCorrect(numeroEsperado, numeroSlotValue, fizzbuzzSlotValue) {
    const resultadoEsperado = fizzBuzz(numeroEsperado);
    const isMultiple = (numeroEsperado % 3 === 0) || (numeroEsperado % 5 === 0);

    if (isMultiple) {
        const respuestaNormalizada = (fizzbuzzSlotValue || '').toLowerCase();
        const respuestasAceptadas = {
            'Fizz': ['fizz', 'fiz', 'salta'],
            'Buzz': ['buzz', 'buz', 'corre'],
            'FizzBuzz': ['fizzbuzz', 'fizbuzz', 'fizzbuz', 'fizbuz', 'vuela']
        };
        return respuestasAceptadas[resultadoEsperado]?.includes(respuestaNormalizada);
    } else {
        const numeroIngresado = parseInt(numeroSlotValue, 10);
        return numeroIngresado === numeroEsperado;
    }
}

function handleIncorrectFizzBuzz(handlerInput, sessionAttributes, turnoActual) {
    const jugadores = sessionAttributes.activePlayers;
    const eliminatedPlayer = jugadores[turnoActual];
    let speakOutput = `¡Has fallado! ¡${eliminatedPlayer.name} estás eliminado! `;

    jugadores.splice(turnoActual, 1);
    sessionAttributes.activePlayers = jugadores;

    if (jugadores.length === 1) {
        return endFizzBuzzGameWithWinner(handlerInput, sessionAttributes, speakOutput);
    }

    turnoActual = turnoActual % jugadores.length;
    sessionAttributes.turnoActual = turnoActual;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    speakOutput += `${jugadores[turnoActual].name}, ¿cuál era la respuesta correcta?`;

    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            ${speakOutput}
            </speak>
        `)
        .reprompt(`${jugadores[turnoActual].name}, ¿cuál era la respuesta correcta?`)
        .getResponse();
}

function handleCorrectFizzBuzz(handlerInput, sessionAttributes, turnoActual) {
    const jugadores = sessionAttributes.activePlayers;

    sessionAttributes.currentNumber += 1;
    turnoActual = (turnoActual + 1) % jugadores.length;
    sessionAttributes.turnoActual = turnoActual;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    const siguienteJugador = jugadores[turnoActual];
    const speakOutput = getRandomFizzBuzzPhrases(siguienteJugador.name);

    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
}

function endFizzBuzzGameWithWinner(handlerInput, sessionAttributes, speakOutput) {
    const winner = sessionAttributes.activePlayers[0];
    speakOutput += `¡Sólo queda ${winner.name} y ha ganado! Tira el dado para ver cuántos escalones subes.`;

    renderScoreAPL(sessionAttributes, handlerInput);

    sessionAttributes.activePlayers = undefined;
    sessionAttributes.currentNumber = undefined;
    sessionAttributes.turnoActual = undefined;
    sessionAttributes.winner = winner;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

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

async function fizzBuzzGame(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const numeroSlotValue = request.intent.slots?.numero?.value;
    const fizzbuzzSlotValue = request.intent.slots?.fizzbuzz?.value;

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    if (!sessionAttributes.activePlayers) {
        sessionAttributes.activePlayers = [...sessionAttributes.originalPlayers];
    }

    const jugadores = sessionAttributes.activePlayers;
    let turnoActual = sessionAttributes.turnoActual || 0;

    if (!sessionAttributes.currentNumber) {
        sessionAttributes.currentNumber = 1;
    }

    const numeroEsperado = sessionAttributes.currentNumber;
    const respuestaCorrecta = isFizzBuzzCorrect(numeroEsperado, numeroSlotValue, fizzbuzzSlotValue);

    if (!respuestaCorrecta) {
        return handleIncorrectFizzBuzz(handlerInput, sessionAttributes, turnoActual);
    }

    return handleCorrectFizzBuzz(handlerInput, sessionAttributes, turnoActual);
}


module.exports = { fizzBuzzGame };
