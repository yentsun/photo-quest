import React, { useContext, useEffect } from 'react';
import GlobalContext from '../globalContext';
import { actions, constants } from '../dictionary';


export default function ToasterMessage({ children, message: localMessage }) {

    const { dispatch: globalDispatch, state: { errorMessage: globalMessage, errorStatus }} = useContext(GlobalContext);
    const errorMessage = localMessage || globalMessage;

    useEffect(() => {

        if (! errorMessage) return;

        const timeoutId = setTimeout(() =>
                globalDispatch({ type: actions.ERROR_DISMISSED }),
            constants.toasterTimeout);

        return () => clearTimeout(timeoutId);
    }, [ errorMessage, globalDispatch ]);

    return (
        <>
            { (errorMessage && errorMessage !== 'Unauthorized') && // Just `Unauthorized` is kind of meaningless
            <div className="alert show-flex-strong">
                <div className="alert-content">

                    <p className="alert-text">

                        { errorStatus === 500 ? 'Server Error: ' : ''}

                        { errorMessage }

                    </p>

                    { children }

                    <button onClick={ () => globalDispatch({ type: a.ERROR_DISMISSED })}
                            type="button" className="close" title="Dismiss message">
                        <i className="icon icon-i-remove" />
                    </button>

                </div>
            </div> }
        </>
    );
}
