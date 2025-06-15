const { DbUtils, SessionUtils } = require('./utils');
const { startMathChainGame} = require('./tools/mathChainTools.js');
const { startTriviaGame} = require('./tools/triviaTools/triviaTools.js');
const { startDetectiveGame } = require('./tools/detectiveTools/detectiveTools.js');
const showRoom = require('./documents/showRoom.json');
const showPark = require('./documents/showPark.json');
const showWordChain = require('./documents/showWordChain.json');
const showFizzBuzz = require('./documents/showFizzBuzz.json');

const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');

function checkGameStarted(numPlayers, handlerInput) {
  return handlerInput.responseBuilder
    .speak("No hay jugadores registrados. Por favor, dime primero cuantos jugadores sois.")
    .reprompt("Por favor, di el número de jugadores.")
    .getResponse();
}

function specialPrompt(id, sessionAttributes, handlerInput) {
  const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
  if (id === 0) {
    if (apl) {
      handlerInput.responseBuilder
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.6',
        token: 'wordChainBoard',
        document: showWordChain,
        datasources: {}
      });
    }
  }
  if (id === 1) {
    return startMathChainGame(sessionAttributes, handlerInput)
  }
  if (id === 2) {
    if (apl) {
      handlerInput.responseBuilder
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.0',
        token: 'fizzBuzzBoard',
        document: showFizzBuzz,
        datasources: {}
      });
    }
  }
  if (id === 3) {
    return startTriviaGame(sessionAttributes, handlerInput)
  }
  if (id === 4) {
    if (apl) {
      handlerInput.responseBuilder
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.4',
        token: 'roomBoard',
        document: showRoom,
        datasources: {}
      });
      sessionAttributes.firstTurn=true;
      handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    }
  }
  if (id === 6) {
    const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];
    if (apl) {
      handlerInput.responseBuilder
      .addDirective({
        type: 'Alexa.Presentation.APL.RenderDocument',
        version: '1.4',
        token: 'detectiveBoard',
        document: showPark,
        datasources: {}
      });
    }
    return startDetectiveGame(sessionAttributes)
  }
  return ""
}

async function chooseMinigame(sessionAttributes, handlerInput) {
  if(sessionAttributes.juegoIniciado === undefined || sessionAttributes.juegoIniciado === false){
    sessionAttributes.juegoIniciado = true; 
    sessionAttributes.rondaActual = 1;
    sessionAttributes.turnoActual = 0;
    sessionAttributes.totalMinigames = await DbUtils.getNumMinigames()
    
    sessionAttributes.juegosSeleccionados = [];
  } else {
    sessionAttributes.winner = undefined;
    sessionAttributes.rondaActual++;
    sessionAttributes.turnoActual=0;
  }

  let availableGames = [];
  for (let i = 0; i < sessionAttributes.totalMinigames; i++) {
    if (!sessionAttributes.juegosSeleccionados.includes(i)) {
      availableGames.push(i);
    }
  }

  if (availableGames.length === 0) {
    sessionAttributes.juegosSeleccionados = [];
    for (let i = 0; i < sessionAttributes.totalMinigames; i++) {
      availableGames.push(i);
    }
  }

  let randomIndex = Math.floor(Math.random() * availableGames.length);
  //let randomIndex=3;
  sessionAttributes.juegoSeleccionado = Number(availableGames[randomIndex]);
  sessionAttributes.juegosSeleccionados.push(sessionAttributes.juegoSeleccionado);

  let speakOutput = await DbUtils.getMinigameInit(sessionAttributes.juegoSeleccionado);

  speakOutput += specialPrompt(sessionAttributes.juegoSeleccionado, sessionAttributes, handlerInput)
  return speakOutput;
}

async function updateMultipleWinnersScore(sessionAttributes, handlerInput, gameId){
  const userId = handlerInput.requestEnvelope.session.user.userId;
  jugadores = sessionAttributes.activePlayers;
  sessionAttributes.activePlayers = undefined;
  let speakOutput = "";

  console.log("Jugadores:", jugadores);

  for (const player of jugadores) {
      player.score = (player.score || 0) + 3;
      await DbUtils.updatePlayerScore(userId, player.name, player.score);
  }

  const winners = jugadores.filter(p => p.score >= 10);

  if (winners.length > 0) {
      const names = winners.map(w => w.name);
      const last = names.pop();
      const nombresText = names.length
          ? names.join(', ') + ' y ' + last
          : last;

      const plural = winners.length > 1;
      const verbo = plural ? 'habéis' : 'has';
      const pronombre = plural ? 'Habéis' : 'Has';
      speakOutput = `¡Felicidades ${nombresText}! ${pronombre} alcanzado 10 puntos y ${verbo} ganado el juego.`;
      return handlerInput.responseBuilder
        .speak(`
        <speak>
          <audio src="soundbank://soundlibrary/musical/amzn_sfx_trumpet_bugle_03"/>
           ${speakOutput}
        </speak>
        `)
        .getResponse();
  }

  const namesAll = jugadores.map(j => j.name);
  const lastAll = namesAll.pop();
  const nombresTextAll = namesAll.length
      ? namesAll.join(', ') + ' y ' + lastAll
      : lastAll;

  if(gameId === 3){
    speakOutput = `¡Habéis respondido todas las preguntas correctamente! ¡Enhorabuena ${nombresTextAll}! Cada uno avanza 3 casillas. `;
  }
  if(gameId === 4){
    speakOutput = `¡Habéis dicho todos los objetos de la habitación! ¡Enhorabuena ${nombresTextAll}! Cada uno avanza 3 casillas. `;
  }
  
  jugadores = await DbUtils.getPlayersInOrder(userId);
  sessionAttributes.originalPlayers = jugadores;
  handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  let minigameIntro = await chooseMinigame(sessionAttributes, handlerInput);
  speakOutput += minigameIntro
  return handlerInput.responseBuilder
    .speak(speakOutput)
    .reprompt(minigameIntro)
    .getResponse();
}
  
module.exports = { checkGameStarted, chooseMinigame, updateMultipleWinnersScore };
  