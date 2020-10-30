import { TrackableStatus, FetchStatus } from '../../shared/state';
import { TextResponse } from '../../../../../models/endpoints/search';
export interface ResultData {
    data: TextResponse | null;
    error?: any;
}

export type ResultDataState = ResultData & TrackableStatus;

export type ResultState = ResultDataState;

export const initialState: ResultState = { status: FetchStatus.INIT, data: null };
