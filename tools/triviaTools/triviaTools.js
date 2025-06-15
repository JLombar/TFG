const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const showTrivial = require('../../documents/showTrivial.json');

const questions = require('./questions');

function startTriviaGame(sessionAttributes, handlerInput) {
    
    if (!sessionAttributes.activePlayers) {
        sessionAttributes.activePlayers = [...sessionAttributes.originalPlayers];
    }
    
    sessionAttributes.usedQuestions = [];
    const availableQuestions = questions.map((q, index) => index);
    sessionAttributes.currentQuestionIndex = availableQuestions[Math.floor(Math.random() * availableQuestions.length)];
    
    const jugadores = sessionAttributes.activePlayers;
    const preguntaActual = questions[sessionAttributes.currentQuestionIndex];

    const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
    if (apl) {
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.RenderDocument',
            version: '1.6',
            token: 'trivialBoard',
            document: showTrivial,
            datasources: {
                trivialData: {
                    question: preguntaActual.question,
                    path: preguntaActual.path,
                }
            }
        });
    }

    return ` ${preguntaActual.question}`;
}

module.exports = { startTriviaGame };