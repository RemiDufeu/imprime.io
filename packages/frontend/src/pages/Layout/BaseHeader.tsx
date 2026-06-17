import { useNavigate } from "react-router-dom"

export default function DefaultHeader() {
    const navigate = useNavigate();

    return (<span
        onClick={() => navigate('/')}
        style={{
            cursor: 'pointer',
            userSelect: 'none',
            fontFamily: '"Courier Prime", "Courier New", monospace',
            fontSize: '22px',
            fontWeight: 'bold',
        }}
    >
        Imprime.io
    </span>
    )
}