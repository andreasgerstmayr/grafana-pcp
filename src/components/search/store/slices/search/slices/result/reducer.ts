import { Reducer } from 'redux';
import { FetchStatus } from '../../shared/state';
import { ResultAction } from './actions';
import { initialState, ResultState } from './state';
import { LOAD_RESULT_ERROR, LOAD_RESULT_INIT, LOAD_RESULT_PENDING, LOAD_RESULT_SUCCESS } from './types';

const resultReducer: Reducer<ResultState, ResultAction> = (state, action) => {
    if (state === undefined) {
        return initialState;
    }
    switch (action.type) {
        case LOAD_RESULT_INIT:
            // Preserve old results while new results started fetching
            return {
                ...(state ?? { data: null }),
                status: FetchStatus.INIT,
            };
        case LOAD_RESULT_PENDING:
            if (state) {
                return {
                    ...state,
                    status: FetchStatus.PENDING,
                };
            }
            break;
        case LOAD_RESULT_SUCCESS:
            if (state) {
                return {
                    status: FetchStatus.SUCCESS,
                    data: action.payload.data,
                };
            }
            break;
        case LOAD_RESULT_ERROR:
            if (state) {
                return {
                    status: FetchStatus.ERROR,
                    data: null,
                    error: action.error,
                };
            }
            break;
        default:
            return state;
    }
    return state;
};

export { resultReducer };
