import "./global.css";

export const metadata={
    title:"Next F1",
    description:"The place to go for all formula one questions"

}

const RootLayout=({ children })=>{
    return(
        <html lang="en">
            <body>{children}</body>
        </html>
    )
}

export default RootLayout