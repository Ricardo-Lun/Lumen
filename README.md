# Lumen

A photography portfolio website designed to showcase a photographer's work, highlight their services, and provide a seamless browsing experience.

## Overview

Lumen is an academic web development project focused on creating a clean, responsive, and visually appealing portfolio website for a photographer. The project aims to provide an elegant platform for presenting photography collections and making information about the photographer and their services accessible to visitors.

The application will be developed using HTML, CSS, and JavaScript, with Vite as the development tool and Firebase Authentication for user authentication.

## Features

- Photography portfolio and gallery.
- Responsive user interface.
- Photographer and service information.
- User authentication using Firebase.
- Maintainable project structure.

*Features are planned and may change as development progresses.*

## Technologies

- **HTML5** — Website structure.
- **CSS3** — Styling and responsive design.
- **JavaScript** — Client-side functionality.
- **Vite** — Development server and build tool.
- **Firebase Authentication** — User authentication.

## Project Structure

```text
Lumen/
├── public/
│   └── images/
├── src/
│   ├── assets/
│   ├── css/
│   │   ├── main.css
│   │   └── auth.css
│   ├── js/
│   │   ├── firebase/
│   │   │   └── config.js
│   │   ├── services/
│   │   │   └── auth.service.js
│   │   ├── pages/
│   │   │   └── login.js
│   │   └── main.js
│   └── ...
├── index.html
├── login.html
├── package.json
├── .gitignore
├── LICENSE
└── README.md
```

The directory structure represents the planned organization of the project and may be adjusted during development.

## Getting Started

### Prerequisites

Make sure the following tools are installed:

- [Node.js](https://nodejs.org/)
- npm, included with Node.js
- [Git](https://git-scm.com/)

### Installation

1. Clone the repository:

   ```bash
   git clone https://github.com/Ricardo-Lun/Lumen.git
   ```

2. Navigate to the project directory:

   ```bash
   cd Lumen
   ```

3. Install the project dependencies:

   ```bash
   npm install
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

Vite will display a local URL in the terminal. Open that address in your browser to access the application.

*These instructions apply once the Vite project configuration has been initialized.*

## Firebase Configuration

Firebase Authentication will be used to manage user authentication.

Firebase configuration must be provided before authentication features can be used. Project-specific configuration should be kept separate from application logic.

## License

This project is licensed under the **GNU General Public License v3.0 (GPL-3.0)**. See the [LICENSE](LICENSE) file for the complete license text.

## Author

**Ricardo-Lun**

GitHub: [@Ricardo-Lun](https://github.com/Ricardo-Lun)
