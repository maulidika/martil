import os, pathlib
INDEX = pathlib.Path(__file__).with_name('index.html').resolve().as_uri()

HAND = ['3C','4C','5D','6H','7D','8D','10C','10H','JD','KC','KH','AS','2C']
def card(i): 
    r, s = i[:-1], i[-1]; return {'id': i, 'rank': r, 'suit': s}

def state(table=None, turn='me', sel=None, hand=None, opp=None, players=None):
    hand = hand or HAND
    opp = opp or [{'id':'Player2623032','cardCount':13},{'id':'Undangx9','cardCount':9},{'id':'acea0_2a280','cardCount':13}]
    return {
      'user': {'id':'me','username':'Syamil_Jumaries'}, 'roomCode':'ABC123', 'connected': True, 'error': None, 'events': [],
      'selectedIds': sel or [], 'currentTurn': turn, 'restricted': False,
      'roomInfo': {'code':'ABC123','hostId':'me','status':'playing','maxGames':4,
                   'setScores': {'me':12,'Player2623032':-4,'Undangx9':3,'acea0_2a280':-11},
                   'players': players or [{'id':'me','connected':True,'inRoom':True}]+[{'id':o['id'],'connected':True,'inRoom':True} for o in opp]},
      'gameState': {'gameNumber':2,'myHand':[card(c) for c in hand],'opponents':opp,'currentTurn':turn,'timeLeft':21000,
                    'table': table if table is not None else []},
    }

FLUSH = [{'playerId':'Player2623032','combo':{'type':'paketan','subtype':'flush','cards':[card(c) for c in ['5S','8S','10S','QS','AS']]}}]

def setup(page, w, h, st):
    page.set_viewport_size({'width': w, 'height': h})
    page.goto(INDEX)
    page.wait_for_function('() => !!window.__store')
    page.evaluate('s => window.__store.setState(s)', st)
    page.wait_for_selector('[data-seat="me"]')
    page.wait_for_timeout(250)

