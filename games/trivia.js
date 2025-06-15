const { DbUtils, renderScoreAPL } = require('../utils');
const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

const { checkGameStarted, chooseMinigame, updateMultipleWinnersScore } = require('../responses');
const questions = require('../tools/triviaTools/questions');

const TrivialPhrases = [
    name => `¡Muy bien! ¡Vamos ${name}, es tu turno!`,
    name => `¡Muy bien! Turno de ${name}. ¡Vamos!`,
    name => `¡Así se hace! ¡Adelante ${name}!`,
    name => `¡Excelente! ${name}, ¿puedes con la siguiente?`,
    name => `¡Qué máquina! A ver cómo lo haces tú, ${name}.`,
    name => `¡Cerebro nivel experto! ${name}, es tu turno.`,
    name => `¡Eres una enciclopedia con patas, ${name}! Sigue tú.`,
    name => `¡Qué mente brillante! Vamos ${name}, no te frenes.`,
    name => `¿Te estudiaste todo Wikipedia? ¡Muy bien! Turno de ${name}.`,
    name => `¡Respuesta correcta! ${name}, vas tú.`,
    name => `¡Así se responde! ¿Listo para otra, ${name}?`,
    name => `¡Te lo sabes todo!, ${name} a ver si sigues así.`,
];

function getRandomTrivialPhrases(name) {
    const index = Math.floor(Math.random() * TrivialPhrases.length);
    const phraseFn = TrivialPhrases[index];
    return phraseFn(name);
}

function extractAnswer(slots) {
    const rawAnswer = slots.answerSlotValue;
    const rawIncorrect = slots.incorrectAnswerSlotValue;

    const answerValue = rawAnswer?.resolutions?.resolutionsPerAuthority?.[0]?.values?.[0]?.value?.id || "";
    const incorrectValue = rawIncorrect?.slotValue?.value || "";

    return answerValue || incorrectValue;
}

function buildNoAnswerResponse(handlerInput) {
    return handlerInput.responseBuilder
        .speak("Ocurrió un error: no he captado ninguna respuesta.")
        .reprompt("Por favor, responde con la respuesta correcta.")
        .getResponse();
}

function askRandomQuestion(handlerInput, sessionAttributes, playerName) {
    const availableQuestions = getAvailableQuestionIndices(sessionAttributes);
    sessionAttributes.currentQuestionIndex = chooseRandomIndex(availableQuestions);
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    const pregunta = questions[sessionAttributes.currentQuestionIndex].question;
    return handlerInput.responseBuilder
        .speak(`Pregunta para ${playerName}: ${pregunta}`)
        .reprompt(`Pregunta para ${playerName}: ${pregunta}`)
        .getResponse();
}

function renderAPL(handlerInput, question, path){
    const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
    if (apl) {
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token: 'trivialBoard',
            commands: [
                { type: 'SetValue', componentId: 'questionText', property: 'text', value: `${question}` },
                { type: 'SetValue', componentId: 'trivialImage', property: 'source', value: path },
            ]
        });
    }
}

function handleIncorrectTrivia(handlerInput, sessionAttributes, turnoActual, jugadores) {
    const eliminatedPlayer = jugadores[turnoActual];
    let speakOutput = `Respuesta incorrecta. ${eliminatedPlayer.name} ha sido eliminado. `;
    jugadores.splice(turnoActual, 1);
    sessionAttributes.activePlayers = jugadores;
    sessionAttributes.usedQuestions.push(sessionAttributes.currentQuestionIndex);

    if (jugadores.length === 1) {
        return declareTriviaWinner(handlerInput, sessionAttributes, jugadores[0], speakOutput);
    }

    turnoActual = turnoActual % jugadores.length;
    sessionAttributes.turnoActual = turnoActual;

    const availableQuestions = getAvailableQuestionIndices(sessionAttributes);
    sessionAttributes.currentQuestionIndex = chooseRandomIndex(availableQuestions);
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    const siguientePregunta = questions[sessionAttributes.currentQuestionIndex].question;

    renderAPL(handlerInput, siguientePregunta, questions[sessionAttributes.currentQuestionIndex].path);

    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            ${speakOutput}Turno de ${jugadores[turnoActual].name}. ${siguientePregunta}
            </speak>    
        `)
        .reprompt(`${jugadores[turnoActual].name}, ${siguientePregunta}`)
        .getResponse();
}

function handleCorrectTrivia(handlerInput, sessionAttributes, turnoActual, jugadores) {
    sessionAttributes.usedQuestions.push(sessionAttributes.currentQuestionIndex);

    if (sessionAttributes.usedQuestions.length === questions.length) {
        resetTriviaSession(sessionAttributes);
        return updateMultipleWinnersScore(sessionAttributes, handlerInput, 3);
    }

    const availableQuestions = getAvailableQuestionIndices(sessionAttributes);
    sessionAttributes.currentQuestionIndex = chooseRandomIndex(availableQuestions);
    turnoActual = (turnoActual + 1) % jugadores.length;
    sessionAttributes.turnoActual = turnoActual;

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    let speakOutput = getRandomTrivialPhrases(jugadores[turnoActual].name);
    speakOutput += ` ${questions[sessionAttributes.currentQuestionIndex].question}`;

    renderAPL(handlerInput, questions[sessionAttributes.currentQuestionIndex].question, questions[sessionAttributes.currentQuestionIndex].path);

    return handlerInput.responseBuilder
        .speak(speakOutput)
        .reprompt(speakOutput)
        .getResponse();
}

function declareTriviaWinner(handlerInput, sessionAttributes, winner, speakOutput) {
    sessionAttributes.activePlayers = undefined;
    sessionAttributes.currentQuestionIndex = undefined;
    sessionAttributes.turnoActual = undefined;
    sessionAttributes.winner = winner;

    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    renderScoreAPL(sessionAttributes, handlerInput);

    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            ${speakOutput}¡${winner.name} es el ganador del juego de trivia! Tira el dado para ver cuántas casillas avanzas.
            </speak>    
        `)
        .reprompt(`¡${winner.name} tira el dado para ver cuántas casillas avanzas!`)
        .getResponse();
}

function getAvailableQuestionIndices(sessionAttributes) {
    return questions
        .map((_, index) => index)
        .filter(index => !sessionAttributes.usedQuestions.includes(index));
}

function chooseRandomIndex(indices) {
    return indices[Math.floor(Math.random() * indices.length)];
}

function resetTriviaSession(sessionAttributes) {
    sessionAttributes.currentQuestionIndex = undefined;
    sessionAttributes.turnoActual = undefined;
}

async function triviaGame(handlerInput) {
    const slots = handlerInput.requestEnvelope.request.intent.slots || {};
    const answerSlotValue = extractAnswer(slots);

    if (!answerSlotValue) {
        return buildNoAnswerResponse(handlerInput);
    }

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    const jugadores = sessionAttributes.activePlayers || [];
    let turnoActual = sessionAttributes.turnoActual || 0;

    if (!sessionAttributes.currentQuestionIndex && answerSlotValue === undefined) {
        return askRandomQuestion(handlerInput, sessionAttributes, jugadores[turnoActual].name);
    }

    const respuestaNormalizada = answerSlotValue.toLowerCase().trim();
    const preguntaActual = questions[sessionAttributes.currentQuestionIndex];
    const respuestaCorrecta = respuestaNormalizada === preguntaActual.answer;

    if (!respuestaCorrecta) {
        return handleIncorrectTrivia(handlerInput, sessionAttributes, turnoActual, jugadores);
    }

    return handleCorrectTrivia(handlerInput, sessionAttributes, turnoActual, jugadores);
}


module.exports = { triviaGame };
