const Alexa = require('ask-sdk-core');
const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const PLAYER_TABLE = "PartyGame";
const MINIGAME_TABLE = "Minigames";

const showScore = require('./documents/showScore.json');


const DbUtils = {
  async saveNumPlayers(userId, numPlayers) {
    try {
      await dynamodb.put({
        TableName: PLAYER_TABLE,
        Item: { id: userId, numPlayers: numPlayers }
      }).promise();
      console.log(`Número de jugadores guardado en DynamoDB: ${numPlayers}`);
      return true;
    } catch (error) {
      console.error("Error al guardar en DynamoDB:", error);
      return false;
    }
  },

  async savePlayerData(userId, playerNames, playerOrder) {
    try {
      let players = playerNames.map((name, index) => ({
        name,
        score: playerOrder[index],
        originalIndex: index
      }));

      const sortedPlayers = [...players].sort((a, b) => {
        if (b.score !== a.score) {
          return b.score - a.score;
        }
        return a.originalIndex - b.originalIndex;
      });

      const orderMapping = {};
      sortedPlayers.forEach((player, rank) => {
        orderMapping[player.originalIndex] = rank + 1;
      });

      players = players.map((player, index) => ({
        name: player.name,
        score: 0,
        order: orderMapping[index]
      }));

      await dynamodb.update({
        TableName: PLAYER_TABLE,
        Key: { id: userId },
        UpdateExpression: 'set jugadores = :players',
        ExpressionAttributeValues: {
          ':players': players
        }
      }).promise();

      console.log("Jugadores guardados en DynamoDB:", players);
      return true;
    } catch (error) {
      console.error("Error al actualizar DynamoDB:", error);
      return false;
    }
  },

  async getPlayers(userId) {
    const params = {
      TableName: PLAYER_TABLE,
      Key: { id: userId }
    };

    try {
      const data = await dynamodb.get(params).promise();
      if (data && data.Item && data.Item.jugadores) {
        return data.Item.jugadores;
      }
      return null;
    } catch (error) {
      console.error("Error al obtener los jugadores:", error);
      return null;
    }
  },

  async getPlayersInOrder(userId) {
    const jugadores = await this.getPlayers(userId);
    if (!jugadores) return null;

    return [...jugadores].sort((a, b) => a.order - b.order);
  },

  async updatePlayerScore(userId, playerName, score) {
    try {
      const data = await dynamodb.get({
        TableName: PLAYER_TABLE,
        Key: { id: userId }
      }).promise();

      if (data && data.Item && data.Item.jugadores) {
        const players = data.Item.jugadores;
        const playerIndex = players.findIndex(player => player.name === playerName);

        if (playerIndex !== -1) {
          players[playerIndex].score = score;

          await dynamodb.update({
            TableName: PLAYER_TABLE,
            Key: { id: userId },
            UpdateExpression: 'set jugadores = :players',
            ExpressionAttributeValues: {
              ':players': players
            }
          }).promise();
          console.log(`Puntuación actualizada para ${playerName}: ${score}`);
          return true;
        } else {
          console.error(`Jugador ${playerName} no encontrado.`);
          return false;
        }
      } else {
        console.error("No se encontraron datos para el jugador.");
        return false;
      }
    } catch (error) {
      console.error("Error al actualizar la puntuación del jugador:", error);
      return false;
    }
  },

  async getNumPlayers(userId) {
    try {
      const data = await dynamodb.get({
        TableName: PLAYER_TABLE,
        Key: { id: userId }
      }).promise();

      if (data && data.Item && typeof data.Item.numPlayers !== 'undefined') {
        console.log(`Número de jugadores recuperado: ${data.Item.numPlayers}`);
        return data.Item.numPlayers;
      } else {
        console.log("No se encontró el número de jugadores en DynamoDB.");
        return null;
      }
    } catch (error) {
      console.error("Error al obtener el número de jugadores:", error);
      return null;
    }
  },

  async getMinigameInit(minigameId) {
    const params = {
      TableName: MINIGAME_TABLE,
      Key: { id: minigameId }
    };

    try {
      const data = await dynamodb.get(params).promise();
      if (data && data.Item && data.Item.init) {
        return data.Item.init;
      }
      return null;
    } catch (error) {
      console.error("Error al obtener el juego:", error);
      return null;
    }
  },

  async getNumMinigames() {
    const params = {
      TableName: MINIGAME_TABLE,
      Select: 'COUNT'
    };

    try {
      const data = await dynamodb.scan(params).promise();
      console.log("Número de IDs en la tabla:", data.Count);
      return data.Count;
    } catch (error) {
      console.error("Error al contar IDs en la tabla:", error);
      return null;
    }
  },
};

const SessionUtils = {
  initializePlayersSession(handlerInput, numPlayers) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.numPlayers = numPlayers;
    sessionAttributes.nombresJugadores = [];
    sessionAttributes.ordenJugadores = [];
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
  },

  addPlayerData(handlerInput, playerName, playerOrder) {
    const sessionAttributes = handlerInput.attributesManager.getSessionAttributes();
    sessionAttributes.nombresJugadores.push(playerName);
    sessionAttributes.ordenJugadores.push(playerOrder);
    handlerInput.attributesManager.setSessionAttributes(sessionAttributes);
    return sessionAttributes;
  },
};

function renderScoreAPL(sessionAttributes, handlerInput) {
  const apl = handlerInput.requestEnvelope.context.System.device.supportedInterfaces['Alexa.Presentation.APL'];

  if (apl) {
    const originalPlayers = sessionAttributes.originalPlayers || [];

    const players = originalPlayers
      .map(player => ({
        ...player,
        name: player.name.charAt(0).toUpperCase() + player.name.slice(1)
      }))
      .sort((a, b) => b.score - a.score);

    handlerInput.responseBuilder.addDirective({
      type: 'Alexa.Presentation.APL.RenderDocument',
      token: 'scoreToken',
      document: showScore,
      datasources: {
        scoreData: {
          scores: players
        }
      }
    });
  }
}




module.exports = {
  DbUtils,
  SessionUtils,
  renderScoreAPL
};