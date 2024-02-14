import React, { useReducer } from 'react';
import { Routes, Route, BrowserRouter, Navigate } from 'react-router-dom';
import GlobalContext, { initialState, reducer } from '../globalContext';
import { routes as r } from '../dictionary';
import ErrorBoundary from './ErrorBoundary';
import Root from './Root';
import ToasterMessage from './ToasterMessage';


export default function Router() {

    const [ state, dispatch ] = useReducer(reducer, initialState);

    return <GlobalContext.Provider value={{ state, dispatch }}>

        { state.messages.map(message =>
        <ToasterMessage message={ message } />) }

        <ErrorBoundary><BrowserRouter><Routes>

            <Route path={ r.root } element={ <Root /> }>  {/* <-- also 'boot' */}

                <Route path={ r.root } element={ <Navigate replace to={ r.dashboard } /> } />
                <Route path={ r.dashboard } element={ <Dashboard /> } />

            </Route>

            {/* catch-all */}
            <Route path="*" element={ <Navigate to={ r.root } /> } />

        </Routes></BrowserRouter></ErrorBoundary>
    </GlobalContext.Provider>
}
