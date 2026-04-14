/**
 * @file GET /decks -- List all decks with card counts.
 */

import { json } from '../src/http.js';

export default async (kojo, logger) => {
  kojo.ops.addHttpRoute({
    method: 'GET',
    pathname: '/decks',
  }, (req, res) => {
    json(res, 200, kojo.ops.listDecks());
  });
};
