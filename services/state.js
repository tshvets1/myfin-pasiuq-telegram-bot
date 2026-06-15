const userState = new Map();

function getState(userId) {
  return userState.get(userId) ?? { step: 'idle' };
}

function setState(userId, data) {
  userState.set(userId, data);
}

function clearState(userId) {
  userState.delete(userId);
}

module.exports = { getState, setState, clearState };
