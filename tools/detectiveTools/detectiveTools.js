const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

const { posiblesObjetos, pistasPorObjeto} = require('./guesses');

function elegirObjetoAleatorio() {
    const index = Math.floor(Math.random() * posiblesObjetos.length);
    return posiblesObjetos[index];
}

function initializeGameSession(sessionAttributes) {
    if (!sessionAttributes.activePlayers) {
        sessionAttributes.activePlayers = [...sessionAttributes.originalPlayers];
    }
    sessionAttributes.pistasDadas = sessionAttributes.pistasDadas ?? 0;
    sessionAttributes.turnoActual = sessionAttributes.turnoActual ?? 0;
    sessionAttributes.objetoSecreto = sessionAttributes.objetoSecreto ?? elegirObjetoAleatorio();
}

function startDetectiveGame(sessionAttributes) {
    initializeGameSession(sessionAttributes);

    const secreto = sessionAttributes.objetoSecreto;
    const pistas = pistasPorObjeto[secreto];
    const pistaIndex = sessionAttributes.pistasDadas;
    const pista = pistas[pistaIndex];
    sessionAttributes.pistasDadas += 1;

    return " Primera pista: " + pista;
}

module.exports = { startDetectiveGame };