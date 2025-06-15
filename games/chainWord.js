const { DbUtils, renderScoreAPL } = require('../utils');

const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

const chainWordPhrases = [
    name => `¡Vamos ${name}, es tu turno!`,      
    name => `¡Le toca a ${name} seguir la cadena!`,
    name => `¡${name}, es tu momento de brillar!`,
    name => `¡Atención, ${name} sigue la cadena!`,
    name => `${name}, te toca.`,
    name => `Turno de ${name} de encadenar. ¡Vamos!`,
    name => `¡Ey ${name}! Es tu turno.`,
];

function getRandomchainWordPhrases(name) {
    const index = Math.floor(Math.random() * chainWordPhrases.length);
    const phraseFn = chainWordPhrases[index];
    return phraseFn(name);
}

function normalizeWord(word) {
    return word
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
}

function syllabify(word) {
    const normalized = normalizeWord(word);
    const vowels = "aeiou";
    const weakVowels = "iu";
    const allowedClusters = ["bl", "br", "cl", "cr", "dr", "fl", "fr", "gl", "gr", "pl", "pr", "tr"];

    let syllables = [];
    let letters = normalized.split('');
    let i = 0;

    while (i < letters.length) {
        let syllable = "";
        
        while (i < letters.length && !vowels.includes(letters[i])) {
        syllable += letters[i];
        i++;
        }
        
        if (i < letters.length && vowels.includes(letters[i])) {
            syllable += letters[i];
            i++;
            while (i < letters.length && vowels.includes(letters[i])) {
                let prevVowel = syllable[syllable.length - 1];
                let currentVowel = letters[i];
                if (weakVowels.includes(prevVowel) || weakVowels.includes(currentVowel)) {
                syllable += currentVowel;
                i++;
                } else {
                    break;
                }
        }
        } else {
            syllables.push(syllable);
            break;
        }
        
        let consCluster = "";
        let j = i;
        while (j < letters.length && !vowels.includes(letters[j])) {
            consCluster += letters[j];
            j++;
        }
        
        if (j === letters.length) {
            syllable += consCluster;
            i = j;
            syllables.push(syllable);
            break;
        }
        
        if (consCluster.length === 0) {
            syllables.push(syllable);
            continue;
        } else if (consCluster.length === 1) {
            syllables.push(syllable);
            continue;
        } else if (consCluster.length === 2) {
        if (allowedClusters.includes(consCluster)) {
            syllables.push(syllable);
            continue;
        } else {
            syllable += consCluster.charAt(0);
            syllables.push(syllable);
            i = i + 1;
            continue;
        }
        } else if (consCluster.length >= 3) {
            let lastTwo = consCluster.slice(-2);
            if (allowedClusters.includes(lastTwo)) {
                syllable += consCluster.charAt(0);
                syllables.push(syllable);
                i = i + 1;
                continue;
            } else {
                syllable += consCluster.slice(0, 2);
                syllables.push(syllable);
                i = i + 2;
                continue;
            }
        }
    }

    return syllables;
}

function getFirstSyllable(word) {
    const syllables = syllabify(word);
    return syllables.length > 0 ? syllables[0] : normalizeWord(word);
}

function getLastSyllable(word) {
    const syllables = syllabify(word);
    return syllables.length > 0 ? syllables[syllables.length - 1] : normalizeWord(word);
}

function isValidChainWord(previousWord, currentWord) {
    if (!previousWord || !currentWord) return false;

    const lastSyllable = getLastSyllable(previousWord);
    const firstSyllable = getFirstSyllable(currentWord);

    return lastSyllable === firstSyllable;
}

function handleMissingWord(handlerInput) {
    return handlerInput.responseBuilder
        .speak("No entendí la palabra. Por favor, di 'Encadena...' seguido de tu palabra.")
        .reprompt("Por favor, di 'Encadena...' seguido de tu palabra.")
        .getResponse();
}

function initializeSession(handlerInput) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    if (!sessionAttributes.activePlayers) {
        sessionAttributes.activePlayers = [...sessionAttributes.originalPlayers];
        console.log('activePlayers no estaba definida, se inicializa:', sessionAttributes.activePlayers);
    }
    return sessionAttributes;
}

function isFirstTurn(sessionAttributes) {
    return sessionAttributes.turnoActual === 0 && !sessionAttributes.palabraPrevia;
}

function renderAPL(handlerInput, palabraPrevia){
    const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
    if (apl) {
        handlerInput.responseBuilder.addDirective({
            type: 'Alexa.Presentation.APL.ExecuteCommands',
            token: 'wordChainBoard',
            commands: [
                { type: 'SetValue', componentId: 'chainText', property: 'text', value: `Última palabra: ${palabraPrevia}` },
            ]
        });
    }
}

function wordValidation(handlerInput, chainWord, sessionAttributes, turnoActual) {
    const jugadores = sessionAttributes.activePlayers;
    const palabraPrevia = sessionAttributes.palabraPrevia;

    if (!isValidChainWord(palabraPrevia, chainWord)) {
        const eliminatedPlayer = jugadores[turnoActual];
        let speakOutput = `La palabra "${chainWord}" no encadena con "${palabraPrevia}". ${eliminatedPlayer.name} ha sido eliminado. `;

        jugadores.splice(turnoActual, 1);
        sessionAttributes.activePlayers = jugadores;

        if (jugadores.length === 1) {
            const winner = jugadores[0];
            speakOutput += `¡${winner.name} ha encadenado todas las palabras y ha ganado el juego! ¡Lanza el dado y descubre cuántas casillas conquista tu victoria!`;
            clearSessionOnGameEnd(sessionAttributes, winner);

            renderScoreAPL(sessionAttributes, handlerInput);
            return {
                response: buildEndGameResponse(handlerInput, speakOutput)
            };
        }

        turnoActual = turnoActual % jugadores.length;
        sessionAttributes.turnoActual = turnoActual;

        speakOutput += `Le toca a ${jugadores[turnoActual].name}. ¡Asegúrate de encadenar bien esta vez!.`;

        return {
            response: buildNextTurnResponse(handlerInput, speakOutput, jugadores[turnoActual].name)
        };
    } else {
        sessionAttributes.palabraPrevia = chainWord;
        return { turnoActual };
    }
}

function clearSessionOnGameEnd(sessionAttributes, winner) {
    sessionAttributes.activePlayers = undefined;
    sessionAttributes.palabraPrevia = undefined;
    sessionAttributes.turnoActual = undefined;
    sessionAttributes.winner = winner;
}

function buildEndGameResponse(handlerInput, speakOutput) {
    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            ${speakOutput}
            </speak>
        `)
        .reprompt("¿Qué ha salido en el dado?")
        .getResponse();
}

function buildNextTurnResponse(handlerInput, speakOutput, playerName) {
    return handlerInput.responseBuilder
        .speak(`
            <speak>
            <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
            ${speakOutput}
            </speak>
        `)
        .reprompt(`${playerName}, di "Encadena ..." seguido de tu palabra.`)
        .getResponse();
}

async function chainWordGame(handlerInput) {
    const request = handlerInput.requestEnvelope.request;
    const chainWord = request.intent.slots?.chainWord?.value;

    if (!chainWord){
        return handleMissingWord(handlerInput);
    }

    const sessionAttributes = initializeSession(handlerInput);
    const jugadores = sessionAttributes.activePlayers;
    let turnoActual = sessionAttributes.turnoActual || 0;

    if (isFirstTurn(sessionAttributes)) {
        sessionAttributes.palabraPrevia = chainWord;
    } else {
        const resultado = wordValidation(handlerInput, chainWord, sessionAttributes, turnoActual);
        if (resultado.response){
            return resultado.response;
        }
        turnoActual = resultado.turnoActual;
    }

    turnoActual = (turnoActual + 1) % jugadores.length;
    sessionAttributes.turnoActual = turnoActual;
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);

    renderAPL(handlerInput, sessionAttributes.palabraPrevia);

    return handlerInput.responseBuilder
        .speak(getRandomchainWordPhrases(jugadores[turnoActual].name))
        .reprompt(`${jugadores[turnoActual].name}, di "Encadena ..." seguido de tu palabra.`)
        .getResponse();
}

module.exports = { chainWordGame };