import React, { useContext, useEffect } from 'react';
import { generatePath, Outlet, useLocation, useMatch, useNavigate } from 'react-router-dom';
import { actions as a, routes } from '../dictionary';


export default function Root() {

    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const { dispatch, state: { token }} = useContext(GlobalContext);
    const [ settings, updateSettings, settingsLoaded ] = useSettings();
    const rootRoute = useMatch(routes.root);

    return <Outlet />;
}
