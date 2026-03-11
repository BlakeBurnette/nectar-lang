// Hello World in Arc
// Demonstrates: components, props, render templates

component Hello(name: String) {
    render {
        <div>
            <h1>"Hello from Arc!"</h1>
            <p>{name}</p>
        </div>
    }
}
