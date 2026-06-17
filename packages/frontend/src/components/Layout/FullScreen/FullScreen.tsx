import './FullScreen.css'

export default function FullScreen({ children }: { children: React.ReactNode }) {
    return (
        <div className="full-screen-container">
            {children}
        </div>
    )
}