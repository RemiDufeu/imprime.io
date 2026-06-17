import './RegularPageContainer.css'

export default function RegularPageContainer({ children }: { children: React.ReactNode }) {
    return (
        <div className="regular-page-container">
            {children}
        </div>
    )
}