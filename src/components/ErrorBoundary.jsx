import React from 'react';
import { routes as r } from '../dictionary';
import suspendedImg from '../img/login-register/account-suspended.png';
import GlobalContext from '../globalContext';
import { clearStorage } from '../keep';


export default class ErrorBoundary extends React.Component {

    static contextType = GlobalContext;
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    componentDidCatch(error, errorInfo) {
        const { state } = this.context;
        this.setState({ hasError: true, error, errorInfo });

        clearStorage();
    }

    render() {

        if (this.state.hasError) {
            return (
                <div className="container-fluid grey-container auth-component">
                    <div className="forgot-password-form">
                        <div className="inner">

                            <div className="successful-password">

                                <div className="header-block">
                                    <img alt="" src={ suspendedImg } />
                                    <h2>Something went wrong</h2>
                                </div>

                                <p>Here is what you can do:</p>

                                <ul>
                                    <li>Reload the page (press <code style={{ fontSize: 'larger' }}>F5</code>)</li>

                                    <li title="Log out"><a href={ r.login } >Log out</a> </li>

                                    <li><a href="mailto:info@simplecrew.com">Contact support</a> with following details:
                                        <details style={{
                                            marginTop: '10px',
                                            whiteSpace: 'pre-wrap',
                                            fontSize: 'smaller',
                                            padding: '20px 30px',
                                            backgroundColor: 'rgba(189, 189, 189, 0.16)' }}>

                                            <ul style={{ marginTop: '20px' }}>
                                                <li>App version: <code>{ process.env.REACT_APP_VERSION }</code></li>
                                                <li>Error message: <code style={{ color: 'darkgray' }}>{ this.state.error.toString() }</code></li>
                                                <li>Error location: <code style={{ color: 'darkgray' }}>{this.state.errorInfo.componentStack.split('\n')[1].trim()}</code></li>
                                            </ul>
                                        </details>
                                    </li>
                                </ul>

                            </div>
                        </div>
                    </div>
                </div>);
        } else
            return this.props.children;
    }
}