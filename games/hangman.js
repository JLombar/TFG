const { DbUtils, renderScoreAPL } = require('../utils');
const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const showHangman = require('../documents/showHangman.json');
const showBoard = require('../documents/showBoard.json');
const { checkGameStarted, chooseMinigame, updateMultipleWinnersScore } = require('../responses');
const MAX_WRONG = 6;
const SECRET_WORD = 'murcielago';

const HangmanPhrases = [
    name => `Ahora es tu oportunidad, ${name}.`,
    name => `${name}, prepárate para tu turno.`,
    name => `A ver qué tal lo haces tú, ${name}.`,
    name => `Tu turno, ${name}. ¡Suerte!`,
    name => `¡Ahora te toca, ${name}!`,
    name => `A ver qué letra o palabra dices, ${name}.`,
    name => `Turno de ${name}.`,
    name => `${name}, ¿qué vas a probar ahora?`,
    name => `Ahora sigue tú, ${name}.`,
    name => `${name}, el siguiente movimiento es tuyo.`,
];
  
function getRandomHangmanPhrases(name) {
    const index = Math.floor(Math.random() * HangmanPhrases.length);
    const phraseFn = HangmanPhrases[index];
    return phraseFn(name);
}

function normalize(str) {
  return str.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isValidLetter(letter) {
  return /^[a-zñ]$/.test(letter);
}

function supportsAPL(handlerInput) {
  return !!handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
}

function playSound(key) {
  return `<audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/${key}_01"/> `;
}

function promptSingleLetter(handlerInput, player) {
  return handlerInput.responseBuilder
    .speak(`${player}, no he entendido tu letra. Di solo una letra.`)
    .reprompt(`${player}, di una sola letra.`)
    .getResponse();
}

function renderAPLUpdate(handlerInput, hangman) {
  const wordProgress = SECRET_WORD
    .split('')
    .map(ch => hangman.guessedLetters.includes(ch) ? ch.toUpperCase() : '_')
    .join(' ');

  const usedLetters = hangman.guessedLetters.length
    ? hangman.guessedLetters.map(l => l.toUpperCase()).join(', ')
    : '—';

  const wrongCount = hangman.wrongCount;
  const imageUrl = `https://jlombar.github.io/PartyGameImages/hangman_${wrongCount}_error.png`;

  handlerInput.responseBuilder.addDirective({
    type: 'Alexa.Presentation.APL.ExecuteCommands',
    token: 'hangmanBoard',
    commands: [
      { type: 'SetValue', componentId: 'hangmanImage', property: 'source', value: imageUrl },
      { type: 'SetValue', componentId: 'wordText', property: 'text', value: `Palabra: ${wordProgress}` },
      { type: 'SetValue', componentId: 'wrongCountText', property: 'text', value: `Errores: ${wrongCount} de ${MAX_WRONG}` },
      { type: 'SetValue', componentId: 'usedLettersText', property: 'text', value: `Letras usadas: ${usedLetters}` }
    ]
  });
}

async function handleCorrectWordGuess(handlerInput, sess, winner, apl) {
  delete sess.hangman;
  sess.winner = winner;
  delete sess.activePlayers;
  delete sess.turnoActual;
  handlerInput.attributesManager.setSessionAttributes(sess);

  renderScoreAPL(sess, handlerInput);

  return handlerInput.responseBuilder
    .speak(`¡Enhorabuena ${winner.name}! Has acertado la palabra "${SECRET_WORD}" y ganas el Ahorcado. ¡Tira el dado!`)
    .getResponse();
}

async function handleNoPlayersLeft(handlerInput, sess) {
  clearHangmanSession(sess);
  const nextMinigame = await chooseMinigame(sess, handlerInput);
  return handlerInput.responseBuilder
    .speak(`
      <speak>
        <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
        Todos los jugadores han sido eliminados. Nadie gana. Vamos con otro juego.
        <audio src="soundbank://soundlibrary/toys_games/board_games/board_games_01"/>
        ${nextMinigame}
      </speak>
    `)

}

async function handleMaxWrong(handlerInput, sess, apl) {
  clearHangmanSession(sess);
  const nextMinigame = await chooseMinigame(sess, handlerInput);

  return handlerInput.responseBuilder
    .speak(`
      <speak>
        <audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/>
        Se han agotado los ${MAX_WRONG} intentos. ¡Todos habéis perdido! Vamos con otro juego.
        <audio src="soundbank://soundlibrary/toys_games/board_games/board_games_01"/>
        ${nextMinigame}
      </speak>
  `)

}

function handleLastPlayerStanding(handlerInput, sess, winner, speakOutput, apl) {
  delete sess.hangman;
  delete sess.activePlayers;
  delete sess.turnoActual;
  sess.winner = winner;
  handlerInput.attributesManager.setSessionAttributes(sess);

  renderScoreAPL(sess, handlerInput);

  return handlerInput.responseBuilder
    .speak(`${speakOutput} <break time="500ms"/> ¡${winner.name} es el último en pie y gana el Ahorcado! ¡Tira el dado!`)
    .reprompt(`¡${winner.name} tira el dado!`)
    .getResponse();
}

function clearHangmanSession(sess) {
  delete sess.hangman;
  delete sess.activePlayers;
  delete sess.turnoActual;
}

async function hangmanGame(handlerInput) {
  const apl = supportsAPL(handlerInput);
  const request = handlerInput.requestEnvelope.request;
  const sess = handlerInput.attributesManager.getSessionAttributes();
  let players = sess.activePlayers || [];
  let turno = sess.turnoActual ?? 0;

  if (players.length === 0) {
    return handlerInput.responseBuilder
      .speak('No hay jugadores activos para continuar el juego.')
      .getResponse();
  }

  if (turno >= players.length) turno = 0;
  const player = players[turno].name;
  const letterSlot = request.intent.slots?.letter?.value;
  const wordSlot = request.intent.slots?.palabra?.value;
  let speakOutput = '';
  let reprompt = '';

  if (wordSlot) {
    const guess = normalize(wordSlot);
    if (guess === SECRET_WORD) {
      return handleCorrectWordGuess(handlerInput, sess, players[turno], apl);
    } else {
      players.splice(turno, 1);
      speakOutput = `<audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/> ¡${player} ha dicho "${wordSlot}" y es incorrecto! Queda eliminado.`;
      turno = turno >= players.length ? 0 : turno;
    }
  }
  else if (letterSlot) {
    const letter = normalize(letterSlot);
    if (!isValidLetter(letter)) {
      return promptSingleLetter(handlerInput, player);
    }

    const hangman = sess.hangman;
    if (hangman.guessedLetters.includes(letter)) {
      hangman.wrongCount++;
      speakOutput = `<audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/> La letra ${letter} ya se había probado. Has perdido un intento.`;
    } else if (!hangman.word.includes(letter)) {
      hangman.wrongCount++;
      hangman.guessedLetters.push(letter);
      speakOutput = `<audio src="soundbank://soundlibrary/alarms/beeps_and_bloops/boing_01"/> La letra ${letter} no está. Has perdido un intento.`;
    } else {
      hangman.guessedLetters.push(letter);
      speakOutput = `<audio src="soundbank://soundlibrary/ui/gameshow/amzn_ui_sfx_gameshow_positive_response_01"/> ¡Bien, la letra ${letter} está en la palabra!`;
    }

    turno = (turno + 1) % players.length;
  }

  if (players.length === 0) {
    return await handleNoPlayersLeft(handlerInput, sess);
  }
  if (sess.hangman.wrongCount >= MAX_WRONG) {
    return await handleMaxWrong(handlerInput, sess, apl);
  }
  if (players.length === 1) {
    return handleLastPlayerStanding(handlerInput, sess, players[0], speakOutput, apl);
  }

  sess.turnoActual = turno;
  sess.activePlayers = players;
  handlerInput.attributesManager.setSessionAttributes(sess);

  const nextPlayer = players[turno].name;
  reprompt = `Turno de ${nextPlayer}, di una letra o intenta adivinar la palabra.`;

  if (apl){
    renderAPLUpdate(handlerInput, sess.hangman);
  }

  return handlerInput.responseBuilder
    .speak(`${speakOutput} ${getRandomHangmanPhrases(nextPlayer)}`)
    .reprompt(reprompt)
    .getResponse();
}


  

module.exports = { hangmanGame };
