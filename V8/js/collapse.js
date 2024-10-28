<script>
        // Obtén todos los elementos con la clase 'pregunta'
        const preguntas = document.querySelectorAll('.pregunta');

        // Añade un evento de clic a cada pregunta
        preguntas.forEach(pregunta => {
            pregunta.addEventListener('click', () => {
                // Obtén la respuesta correspondiente al clic
                const respuesta = pregunta.nextElementSibling;

                // Alterna la visibilidad de la respuesta
                if (respuesta.style.display === 'block') {
                    respuesta.style.display = 'none';
                } else {
                    respuesta.style.display = 'block';
                }
            });
        });
    </script>