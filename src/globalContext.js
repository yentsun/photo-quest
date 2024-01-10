import React from 'react';
import { actions as a } from './dictionary';


export const initialState = {
    settings: {}
};

export const reducer = (state, action) => {

    switch (action.type) {

        case a.SETTINGS_LOADED:
            return {...state,
                settingsLoaded: true,
                selfId: action.selfId,
                companyId: action.settings.selectedCompanyId,
                settings: action.settings };

        case a.SETTING_UPDATED:
            return {...state,
                settings: { ...state.settings, ...action.setting }};

        default:
            throw new Error('unknown action type: '+action.type);
    }
};

const GlobalContext = React.createContext();

export default GlobalContext;
