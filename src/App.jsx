import logo from './logo.svg';
import Card from './components/Card';


export default function App() {

    return <div className="bg-black grid h-screen place-items-center">



        <Card>
            <img src={ logo } alt="logo" />
        </Card>


    </div>;
}
