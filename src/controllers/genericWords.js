import {
  assign,
  every,
  has,
  partial,
  map,
  trim,
} from 'lodash';
import GenericWord from '../models/GenericWord';
import testGenericWordsDictionary from '../../tests/__mocks__/genericWords.mock.json';
import genericWordsDictionary from '../dictionaries/ig-en/ig-en_normalized_expanded.json';
import SortingDirections from '../shared/constants/sortingDirections';
import { packageResponse, handleQueries, populateFirebaseUsers } from './utils';
import { searchPreExistingGenericWordsRegexQuery } from './utils/queries';
import {
  handleDeletingExampleSuggestions,
  getExamplesFromClientData,
  updateNestedExampleSuggestions,
  placeExampleSuggestionsOnSuggestionDoc,
} from './utils/nestedExampleSuggestionUtils';

const REQUIRE_KEYS = ['word', 'wordClass', 'definitions'];

/* Updates an existing WordSuggestion object */
export const putGenericWord = (req, res) => {
  const { body: data, params: { id } } = req;
  const clientExamples = getExamplesFromClientData(data);

  if (!every(REQUIRE_KEYS, partial(has, data))) {
    res.status(400);
    return res.send({ error: 'Required information is missing, double check your provided data' });
  }

  if (!Array.isArray(data.definitions)) {
    data.definitions = map(data.definitions.split(','), (definition) => trim(definition));
  }

  return GenericWord.findById(id)
    .then(async (genericWord) => {
      if (!genericWord) {
        res.status(400);
        return res.send({ error: 'Generic word doesn\'t exist' });
      }
      const updatedGenericWord = assign(genericWord, data);
      await handleDeletingExampleSuggestions({ suggestionDoc: genericWord, clientExamples });

      /* Updates all the word's children exampleSuggestions */
      await updateNestedExampleSuggestions({ suggestionDocId: genericWord.id, clientExamples });

      await updatedGenericWord.save();
      const savedGenericWord = await placeExampleSuggestionsOnSuggestionDoc(updatedGenericWord);
      return res.send(savedGenericWord);
    })
    .catch(() => {
      res.status(400);
      return res.send({ error: 'An error has occurred while updating, double check your provided data' });
    });
};

export const findGenericWordById = (id) => (
  GenericWord.findById(id)
);

export const findGenericWords = ({ regexMatch, skip, limit }) => (
  GenericWord
    .find(regexMatch)
    .sort({ approvals: SortingDirections.DESCENDING })
    .skip(skip)
    .limit(limit)
);

/* Returns all existing GenericWord objects */
export const getGenericWords = (req, res) => {
  try {
    const {
      regexKeyword,
      skip,
      limit,
      ...rest
    } = handleQueries(req.query);
    const regexMatch = searchPreExistingGenericWordsRegexQuery(regexKeyword);
    return findGenericWords({ regexMatch, skip, limit })
      .then(async (genericWords) => {
        /* Places the exampleSuggestions on the corresponding genericWords */
        const genericWordsWithExamples = await Promise.all(
          map(genericWords, placeExampleSuggestionsOnSuggestionDoc),
        );
        const packagedResponse = await packageResponse({
          res,
          docs: genericWordsWithExamples,
          model: GenericWord,
          query: regexMatch,
          ...rest,
        });
        return packagedResponse;
      })
      .catch(() => {
        throw new Error('An error has occurred while returning all generic words');
      });
  } catch (err) {
    res.status(400);
    return res.send({ error: err.message });
  }
};

/* Returns a single WordSuggestion by using an id */
export const getGenericWord = (req, res) => {
  const { id } = req.params;
  return findGenericWordById(id)
    .then(async (genericWord) => {
      if (!genericWord) {
        res.status(400);
        return res.send({ error: 'No genericWord exists with the provided id.' });
      }
      const genericWordWithExamples = await placeExampleSuggestionsOnSuggestionDoc(genericWord);
      const populatedUsersGenricWordWithExamples = await populateFirebaseUsers(
        genericWordWithExamples,
        ['approvals', 'denials'],
      );
      return res.send(populatedUsersGenricWordWithExamples);
    })
    .catch(() => {
      res.status(400);
      return res.send({ error: 'An error has occurred while return a single generic word' });
    });
};

/* Populates the MongoDB database with GenericWords */
export const createGenericWords = (_, res) => {
  const dictionary = process.env.NODE_ENV === 'test' ? testGenericWordsDictionary : genericWordsDictionary;
  const genericWordsPromises = map(dictionary, (value, key) => {
    const newGenericWord = new GenericWord({
      word: key,
      definitions: value,
    });
    return newGenericWord.save();
  });

  Promise.all(genericWordsPromises)
    .then(() => (
      res.send({ message: 'Successfully populated generic words' })
    ))
    .catch(() => {
      res.status(400);
      return res.send({ error: 'An error has occurred while populating generic words' });
    });
};

/* Deletes a single GenericWord by using an id */
export const deleteGenericWord = (req, res) => {
  const { id } = req.params;
  return GenericWord.findByIdAndDelete(id)
    .then((genericWord) => {
      if (!genericWord) {
        res.status(400);
        return res.send({ error: 'No generic word exists with the provided id.' });
      }
      return res.send(genericWord);
    })
    .catch(() => {
      res.status(400);
      return res.send({ error: 'An error has occurred while deleting and return a single generic word' });
    });
};
