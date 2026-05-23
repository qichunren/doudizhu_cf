export const CodeOK = 0
export const CodeInvalidAction = 1001
export const CodeInvalidParams = 1002
export const CodeUnauthorized = 1003
export const CodeMsgIDDuplicate = 1004
export const CodeRateLimited = 1005

export const CodeRoomNotFound = 2001
export const CodeRoomFull = 2002
export const CodeRoomPasswordWrong = 2003
export const CodeRoomAlreadyStart = 2004
export const CodeNotYourTurn = 2005
export const CodeInvalidCards = 2006
export const CodeCardsNotBeat = 2007
export const CodeNotLandlord = 2008

export const CodeMatchNotFound = 3001
export const CodeMatchAlreadyInQ = 3002

export const CodeUserNotFound = 4001
export const CodeAccountExists = 4002
export const CodeWrongPassword = 4003

export const CodeServerError = 5001

export const errorMessages: Record<number, string> = {
  [CodeOK]: 'ok',
  [CodeInvalidAction]: 'invalid action',
  [CodeInvalidParams]: 'invalid params',
  [CodeUnauthorized]: 'unauthorized',
  [CodeRoomNotFound]: 'room not found',
  [CodeRoomFull]: 'room is full',
  [CodeRoomPasswordWrong]: 'wrong password',
  [CodeRoomAlreadyStart]: 'game already started',
  [CodeNotYourTurn]: 'not your turn',
  [CodeInvalidCards]: 'invalid cards',
  [CodeCardsNotBeat]: 'cards cannot beat current',
  [CodeUserNotFound]: 'user not found',
  [CodeAccountExists]: 'account already exists',
  [CodeWrongPassword]: 'wrong password',
  [CodeServerError]: 'server error',
}
