const { DbUtils, renderScoreAPL } = require('../utils');
const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

const { checkGameStarted, chooseMinigame, updateMultipleWinnersScore } = require('../responses');
const { posiblesObjetos, pistasPorObjeto} = require('../tools/detectiveTools/guesses');

function normalizeSlot(rawSlotValue) {
    const raw = rawSlotValue ? rawSlotValue.trim().toLowerCase() : '';
    return raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function resetAdivinaSession(sessionAttributes) {
    sessionAttributes.pistasDadas = 0;
    sessionAttributes.turnoActual = 0;
    sessionAttributes.activePlayers = undefined;
    sessionAttributes.objetoSecreto = undefined;
}

function elegirObjetoAleatorio() {
    const index = Math.floor(Math.random() * posiblesObjetos.length);
    return posiblesObjetos[index];
}

async function detectiveGame(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const slotValor = normalizeSlot(request.intent.slots?.objeto?.value);

    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();

    const jugadores = sessionAttributes.activePlayers;
    let turno = sessionAttributes.turnoActual;
    const jugadorActual = jugadores[turno];
    const nombreJugador = jugadorActual.name;
    const secreto = sessionAttributes.objetoSecreto;
    const pistas = pistasPorObjeto[secreto];

    if (!slotValor) {
        return handlerInput.responseBuilder
            .speak(`No escuché ningún objeto. ${nombreJugador}, por favor di tu intento.`)
            .reprompt(`${nombreJugador}, intenta adivinar el objeto.`)
            .getResponse();
    }

    if (slotValor === secreto) {
        resetAdivinaSession(sessionAttributes);
        sessionAttributes.winner = jugadorActual;
        handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

        renderScoreAPL(sessionAttributes, handlerInput);

        return handlerInput.responseBuilder
            .speak(`
                <speak>
                <audio src="soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01"/>
                ¡Me has pillado ${nombreJugador}! Has adivinado el objeto. ¡Felicidades! Tira el dado para avanzar
                </speak>
            `)
            .getResponse();
    }

    const pistaIndex = sessionAttributes.pistasDadas;
    const pista = pistas[pistaIndex] || 'No tengo más pistas. ¡Intenta de nuevo!';

    sessionAttributes.pistasDadas += 1;
    turno = (turno + 1) % jugadores.length;
    sessionAttributes.turnoActual = turno;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    const siguienteJugador = jugadores[turno].name;

    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            No es correcto, ${nombreJugador}. Pista: ${pista} Turno de ${siguienteJugador}.
            </speak>
        `)
        .reprompt(`${siguienteJugador}, intenta adivinar el objeto.`)
        .getResponse();
}

module.exports = { detectiveGame };
