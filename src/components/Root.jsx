import React, { useContext, useEffect } from 'react';
import { generatePath, Outlet, useLocation, useMatch, useNavigate, useParams } from 'react-router-dom';
import { actions as a, routes } from '../dictionary';


export default function Root() {

    const { pathname, search } = useLocation();
    const navigate = useNavigate();
    const { dispatch, state: { token }} = useContext(GlobalContext);
    const [ settings, updateSettings, settingsLoaded ] = useSettings();
    APIclient._dispatch_ = dispatch; // TODO switch to hooks ASAP!
    const rootRoute = useMatch(_routes_.root);
    const publicCampaign = useMatch(_routes_.campaignShare);
    const [ self, , mutateSelf ] = useSelf();

    // 🖼 Apply Tailwind theme
    useEffect(() => {

        applyTheme(baseTheme);

    }, []);

    // store companyId
    useEffect(() => {

        if (companyId) {
            updateSettings({ selectedCompanyId: companyId });
            mutateSelf();
        }

    }, [ companyId, updateSettings, mutateSelf ]);

    // 🔑📤 load token from storage
    useEffect(() => {

        if (token !== null) return;

        const tokenFromStorage = getTokenFromStorage();

        if (tokenFromStorage) {
            console.debug('🔑📤✅ got token from storage');
            dispatch({ type: a.TOKEN_RECEIVED, token: tokenFromStorage });
        }

        if (! tokenFromStorage) {
            console.debug('🔑📤❌ no token in storage');
            dispatch({ type: a.TOKEN_RECEIVED, token: false });
        }

    }, [ token, dispatch, navigate, publicCampaign ]);

    // ⚙📤 LOAD SETTINGS WHEN TOKEN IS AVAILABLE
    useEffect(() => {

        if (! token) return;

        const { uid } = jwtDecode(token);
        console.debug('👤🆔 got user ID from token', uid);
        const settingsFromStorage = getSettingsFromStorage(uid);
        dispatch({ type: a.SETTINGS_LOADED, settings: settingsFromStorage, selfId: uid });
        console.debug('👤⚙📤✅ got user settings from storage', settingsFromStorage);

    }, [ token, dispatch ]);

    // ⚙💾 STORE SETTINGS ON CHANGE
    useEffect(() => {

        if (self?.id && settings) {
            storeSettings(self.id, settings);
            console.debug('👤⚙💾 updated user settings stored');
        }

    }, [ self, settings ]);

    // 🧭 track location change
    useEffect(() => {
        console.debug('🧭 navigated to', pathname);
        dispatch({ type: a.LOCATION_CHANGED, pathname });

        if (! campaignId)
            document.title = title;

    }, [ pathname, dispatch, campaignId ]);

    // add window width tracking
    useEffect(() => {
        function dispatchEvent() {
            dispatch({ type: a.WINDOW_WIDTH_CHANGED, width: window.innerWidth });
        }

        dispatchEvent();
        window.addEventListener('resize', dispatchEvent);

        return () =>
            window.removeEventListener('resize', dispatchEvent);
    }, [ dispatch ]);

    // 🔑🌎 handle token presence in URL
    useEffect(() => {

        const params = new URLSearchParams(search);
        const token = params.get('token');
        params.delete('token');

        // skip if there is no 'token' key
        if (token === undefined) return;

        // if token value is empty string - logout
        if (token === '') {
            dispatch({ type: a.TOKEN_RECEIVED, token: false });
            console.debug('force logout');
            clearTokenFromStorage();
        }

        // otherwise store the token and update state
        if (token) {
            dispatch({ type: a.TOKEN_RECEIVED, token });
            navigate(`${pathname}?${params.toString()}`);
            storeToken(token);
        }
    }, [ search, navigate, pathname, dispatch ]);

    // ⏩ redirect to and from root
    useEffect(() => {

        if (rootRoute && (token === false)) {
            console.debug('⏩ redirecting to login');
            navigate(_routes_.login);
        }

        if (! settingsLoaded) return;

        if (rootRoute && companyId && token) {
            console.debug('⏩ redirecting to company root 🆔', companyId);
            navigate(generatePath(_routes_.company, { companyId }));
        }

        if (rootRoute && self?.meta && ! companyId) {
            console.debug('⏩ redirecting to default company root 🆔', self.meta.companyId);
            navigate(generatePath(_routes_.company, { companyId: self.meta.companyId }));
        }

    }, [ rootRoute, token, navigate, companyId, self, settingsLoaded ]);

    return <Outlet />;
}
