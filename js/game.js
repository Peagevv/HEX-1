
// Import required Three.js components (if using modules)
// import * as THREE from 'three';
// import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
// import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
// import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

// Variables globales
let scene, camera, renderer, controls, clock, mixer, villainMixer;
let modeloEscenario, villainModel;
let currentVillainAction = null;
const objetosColision = [];
let teclas = {};
let villainHealth = 100;
let villainIsDead = false;
let gameWon = false;
let playerHealth = 100;
let playerIsDead = false;

let villainHasTaunted = false;
let velocidadBase = 0.1;
let velocidadActual = velocidadBase;
const velocidadCorrer = velocidadBase * 2;
let puedeSaltar = true;
const gravedad = 0.002;
let velocidadY = 0;
let personajeEnSuelo = false;
let tiempoUltimoSalto = 0;
const retrasoSalto = 500; // 500ms entre saltos
let enemyHealth = 100;

const playerHealthDisplay = document.getElementById("playerHealth");
const enemyHealthDisplay = document.getElementById("enemyHealth");

function updateHealthDisplays() {
    playerHealthDisplay.textContent = playerHealth;
    enemyHealthDisplay.textContent = enemyHealth;
}
// Estados del villano
const VILLAIN_STATES = {
    WALKING: 'Walking',
    PUNCHING_BAG: 'Punching Bag',
    FAST_RUN: 'Fast Run',
    BRUTAL_ASSASSINATION: 'Brutal Assassination',
    EXCITED: 'Excited',
    RECEIVE_HIT: 'Receive Uppercut To The Face',
    TAUNT: 'Taunt'
};
let villainState = VILLAIN_STATES.WALKING;
let villainAnimations = {};

// Configuración inicial
function init() {
    // Crear escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87CEEB);
    clock = new THREE.Clock();

    // Configurar cámara en primera persona
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = 0.8; // Altura aproximada de una persona

    // Configurar renderizador
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controles FPS
    controls = new THREE.PointerLockControls(camera, document.body);
    scene.add(controls.getObject());

    document.addEventListener('mousedown', (event) => {
        if (event.button === 2 && !villainIsDead) {
            checkAttackHit();
        }
    });
    document.addEventListener('contextmenu', event => event.preventDefault());


    // Habilitar controles al hacer clic
    document.addEventListener('click', () => {
        if (!controls.isLocked) {
            controls.lock();
        }
    });

    // Eventos de bloqueo/desbloqueo de puntero
    controls.addEventListener('lock', () => {
        document.getElementById('crosshair').style.display = 'block';
    });

    controls.addEventListener('unlock', () => {
        document.getElementById('crosshair').style.display = 'none';
    });
    scene.fog = new THREE.Fog(0x000080, 10, 100);
    scene.background = new THREE.Color(0x00000); // Fondo también negro para mayor realismo


    // Configurar luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    ;


    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Cargar modelo del escenario
    const loader = new THREE.GLTFLoader();
    loader.load(
        './models/free_low_poly_game_assets.glb',
        (gltf) => {
            modeloEscenario = gltf.scene;
            modeloEscenario.position.set(8, -8, 0);
            modeloEscenario.scale.set(1, 1, 1);

            // Configurar sombras y colisiones
            modeloEscenario.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    // Agregar a objetos de colisión (excepto decoraciones)
                    if (!child.name.includes('decor') && !child.name.includes('planta')) {
                        objetosColision.push(child);
                    }
                }
            });

            // Configurar animaciones si existen
            if (gltf.animations && gltf.animations.length) {
                mixer = new THREE.AnimationMixer(modeloEscenario);
                gltf.animations.forEach((clip) => {
                    mixer.clipAction(clip).play();
                });
            }

            scene.add(modeloEscenario);

            // Cargar modelo del villano después de cargar el escenario
            loadVillainModel();

            document.getElementById('loading').style.display = 'none';
        },
        undefined,
        (error) => {
            console.error('Error al cargar el escenario:', error);
            document.getElementById('loading').textContent = 'Error cargando escenario';
        }
    );

    // Configurar teclado
    document.addEventListener('keydown', (event) => {
        teclas[event.code] = true;

        // Correr (Shift)
        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            velocidadActual = velocidadCorrer;
        }

        // Salto (con retraso entre saltos)
        if (event.code === 'Space' && personajeEnSuelo && Date.now() - tiempoUltimoSalto > retrasoSalto) {
            velocidadY = 0.11;
            personajeEnSuelo = false;
            tiempoUltimoSalto = Date.now();
        }

        // Teclas de prueba para animaciones del villano (solo para desarrollo)
        if (event.code === 'Digit1') setVillainAnimation(VILLAIN_STATES.WALKING);
        if (event.code === 'Digit2') setVillainAnimation(VILLAIN_STATES.PUNCHING_BAG);
        if (event.code === 'Digit3') setVillainAnimation(VILLAIN_STATES.FAST_RUN);
        if (event.code === 'Digit4') setVillainAnimation(VILLAIN_STATES.BRUTAL_ASSASSINATION);
        if (event.code === 'Digit5') setVillainAnimation(VILLAIN_STATES.EXCITED);
    });

    document.addEventListener('keyup', (event) => {
        teclas[event.code] = false;

        // Dejar de correr
        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            velocidadActual = velocidadBase;
        }
    });

    // Manejar redimensionamiento
    window.addEventListener('resize', onWindowResize);
}
// FUNCIONES PARA ACTUALIZAR INTERFAZ
function updateHealthDisplays() {
    document.getElementById("enemy-health").textContent = enemyHealth;
    document.getElementById("player-health").textContent = playerHealth;
}
// FUNCIONES DE GAME OVER
let gameEnded = false;
function showGameOverScreen(victory) {
    if (gameEnded) return;
    gameEnded = true;
    const screen = document.createElement("div");
    screen.style.position = "fixed";
    screen.style.top = "0";
    screen.style.left = "0";
    screen.style.width = "100vw";
    screen.style.height = "100vh";
    screen.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
    screen.style.display = "flex";
    screen.style.justifyContent = "center";
    screen.style.alignItems = "center";
    screen.style.color = "white";
    screen.style.fontSize = "48px";
    screen.style.zIndex = "9999";
    screen.textContent = victory ? "¡Has ganado!" : "¡Has muerto!";
    document.body.appendChild(screen);
}

// FUNCIONES DE DAÑO
function damageEnemy(amount) {
    enemyHealth -= amount;
    if (enemyHealth < 0) enemyHealth = 0;
    updateHealthDisplays();
    if (enemyHealth === 0) {
        console.log("¡Villano derrotado!");
        showGameOverScreen(true);
    }
}

function damagePlayer(amount) {
    playerHealth -= amount;
    if (playerHealth < 0) playerHealth = 0;
    updateHealthDisplays();
    if (playerHealth === 0) {
        console.log("¡Has muerto!");
        showGameOverScreen(false);
    }
}
// Función para cargar el modelo del villano
function loadVillainModel() {
    const fbxLoader = new THREE.FBXLoader();

    fbxLoader.load(
        './models/amy/Walking.fbx',
        (fbx) => {
            villainModel = fbx;
            villainModel.scale.set(0.01, 0.01, 0.01);
            villainModel.position.set(5, -8, 5);

            // Configurar sombras
            villainModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(villainModel);

            // Cargar animaciones del villano
            loadVillainAnimations();
        },
        undefined,
        (error) => {
            console.error('Error al cargar el modelo del villano:', error);
        }
    );
}

// Función para cargar las animaciones del villano
function loadVillainAnimations() {
    const fbxLoader = new THREE.FBXLoader();
    const animationFiles = [
        { name: VILLAIN_STATES.WALKING, file: './models/amy/Walking.fbx' },
        { name: VILLAIN_STATES.PUNCHING_BAG, file: './models/amy/Punching Bag.fbx' },
        { name: VILLAIN_STATES.FAST_RUN, file: './models/amy/Fast Run.fbx' },
        { name: VILLAIN_STATES.BRUTAL_ASSASSINATION, file: './models/amy/Brutal Assassination.fbx' },
        { name: VILLAIN_STATES.EXCITED, file: './models/amy/Excited.fbx' },
        { name: VILLAIN_STATES.RECEIVE_HIT, file: './models/amy/receive uppercut to the face.fbx' },
        { name: VILLAIN_STATES.TAUNT, file: './models/amy/taunt.fbx' }


    ];

    let loadedCount = 0;

    animationFiles.forEach((anim) => {
        fbxLoader.load(
            anim.file,
            (animation) => {
                villainAnimations[anim.name] = animation.animations[0];
                loadedCount++;

                // Cuando todas las animaciones estén cargadas
                if (loadedCount === animationFiles.length) {
                    setupVillainAnimations();
                }
            },
            undefined,
            (error) => {
                console.error(`Error al cargar la animación ${anim.name}:`, error);

            }
        );
    });
}

// Configurar el sistema de animaciones del villano
function setupVillainAnimations() {
    villainMixer = new THREE.AnimationMixer(villainModel);

    // Crear acciones para cada animación
    for (const [name, clip] of Object.entries(villainAnimations)) {
        const action = villainMixer.clipAction(clip);
        action.name = name;

        // Configurar la animación de caminar como la predeterminada
        if (name === VILLAIN_STATES.WALKING) {
            action.play();
        }
    }

    // Iniciar con la animación de caminar
    setVillainAnimation(VILLAIN_STATES.WALKING);
}

// Función para cambiar la animación del villano
function setVillainAnimation(state) {
    if (!villainMixer || villainState === state) return;

    const newAction = villainMixer.clipAction(villainAnimations[state]);
    if (!newAction) return;

    newAction.reset();

    if (state === VILLAIN_STATES.BRUTAL_ASSASSINATION || state === VILLAIN_STATES.EXCITED) {
        newAction.setLoop(THREE.LoopOnce, 1);
        newAction.clampWhenFinished = true;
    } else {
        newAction.setLoop(THREE.LoopRepeat, Infinity);
    }

    if (state === VILLAIN_STATES.EXCITED) {
        newAction.fadeIn(1).play(); // transición más lenta
        if (currentVillainAction) {
            currentVillainAction.fadeOut(.1);
        }
    } else {
        newAction.fadeIn(0.3).play();
        if (currentVillainAction) {
            currentVillainAction.fadeOut(0.3);
        }
    }


    currentVillainAction = newAction;
    villainState = state;

    // Volver a caminar después de animaciones únicas
    if (state === VILLAIN_STATES.BRUTAL_ASSASSINATION || state === VILLAIN_STATES.EXCITED) {
        setTimeout(() => {
            if (!villainIsDead) {
                setVillainAnimation(VILLAIN_STATES.WALKING);
            }
        }, newAction.getClip().duration * 1000);
    }
}



// Función para verificar si el jugador ha matado al villano
function checkAttackHit() {
    if (villainIsDead) return;
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2(0, 0); // Centro de la pantalla
    raycaster.setFromCamera(mouse, camera);

    const intersects = raycaster.intersectObject(villainModel, true);

    if (intersects.length > 0) {
        villainHealth -= 20;
        console.log(`Villano golpeado. Vida restante: ${villainHealth}`);

        if (villainHealth <= 0) {
            villainIsDead = true;
            setVillainAnimation(VILLAIN_STATES.BRUTAL_ASSASSINATION);
            checkPlayerWin();
        } else {
            setVillainAnimation(VILLAIN_STATES.RECEIVE_HIT);
            // Volver a caminar después de recibir golpe
            setTimeout(() => {
                if (!villainIsDead) {
                    setVillainAnimation(VILLAIN_STATES.WALKING);
                }
            }, 40000); // 1 segundo de animación de recibir golpe
        }
    }
}
function checkVillainDeath() {
    if (villainIsDead && !gameWon) {
        // Aquí podrías agregar lógica adicional o sonido
        console.log("¡Villano eliminado!");
    }
}
// Función para verificar si el jugador ha ganado
function checkPlayerWin() {
    if (villainIsDead && !gameWon) {
        const distance = controls.getObject().position.distanceTo(villainModel.position);
        if (distance < 2) {
            gameWon = true;
            setVillainAnimation(VILLAIN_STATES.EXCITED);
            alert("¡Has ganado!");
        }
    }
}
function moverVillanoHaciaJugador(delta) {
    if (!villainModel || villainIsDead) return;

    const jugadorPos = controls.getObject().position.clone();
    const villanoPos = villainModel.position.clone();
    const direccion = jugadorPos.sub(villanoPos);
    direccion.y = 0;

    const distancia = direccion.length();

    if (distancia > 0.5) {
        direccion.normalize();

        let velocidadVillano = 0.02;
        if (villainState === VILLAIN_STATES.FAST_RUN) {
            velocidadVillano = 0.05; // 👈 Más rápido al correr
        }

        direccion.multiplyScalar(velocidadVillano * delta * 60);
        villainModel.position.add(direccion);

        villainModel.lookAt(controls.getObject().position.clone().setY(villainModel.position.y));
    }
}


let tiempoUltimoAtaque = 0;
const intervaloAtaque = 2000; // puede atacar cada 2 segundos

function intentarAtacarJugador() {
    if (villainIsDead || playerIsDead) return;

    const ahora = Date.now();
    const distancia = villainModel.position.distanceTo(controls.getObject().position);

    // Inicializa el tiempo del último ataque si no existe
    if (!intentarAtacarJugador.ultimoAtaque) {
        intentarAtacarJugador.ultimoAtaque = 0;
    }

    // Solo ataca si ha pasado más de 1 segundo desde el último ataque
    if (distancia < 2 && (ahora - intentarAtacarJugador.ultimoAtaque > 1000)) {
        intentarAtacarJugador.ultimoAtaque = ahora;

        // Ataca
        setVillainAnimation(VILLAIN_STATES.BRUTAL_ASSASSINATION);

        // Resta vida al jugador
        playerHealth -= 10;
        console.log("¡Te golpearon! Vida restante: " + playerHealth);

        // Si la vida del jugador llega a 0
        if (playerHealth <= 0) {
            playerIsDead = true;
            console.log("¡Has sido derrotado!");
            setVillainAnimation(VILLAIN_STATES.EXCITED);
            alert("¡Has perdido!");

            // 🔁 Reiniciar el juego después de 3 segundos
            setTimeout(() => {
                location.reload();
            }, 5000);
        }
    }
}




function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Detección de colisiones mejorada
function verificarColisiones(posicion) {
    const cajaPersonaje = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(posicion.x, posicion.y - 0.3, posicion.z),
        new THREE.Vector3(0.1, .8, 0.1)
    );

    for (const objeto of objetosColision) {
        const cajaObjeto = new THREE.Box3().expandByObject(objeto);
        if (cajaPersonaje.intersectsBox(cajaObjeto)) {
            return true;
        }
    }
    return false;
}

// Movimiento del personaje mejorado
function moverPersonaje(delta) {
    if (!controls.isLocked) return;

    const velocidad = velocidadActual * delta * 60;
    const movimiento = new THREE.Vector3();

    const direccion = new THREE.Vector3();
    camera.getWorldDirection(direccion);
    direccion.y = 0;
    direccion.normalize();

    const derecha = new THREE.Vector3();
    derecha.crossVectors(camera.up, direccion).normalize();

    if (teclas['KeyW']) movimiento.add(direccion);
    if (teclas['KeyS']) movimiento.sub(direccion);
    if (teclas['KeyA']) movimiento.add(derecha);
    if (teclas['KeyD']) movimiento.sub(derecha);

    if (movimiento.length() > 0) {
        movimiento.normalize().multiplyScalar(velocidad);
    }

    // Movimiento horizontal
    const nuevaPos = controls.getObject().position.clone();
    nuevaPos.add(movimiento);

    // Eje X/Z separados para colisión
    const nuevaX = controls.getObject().position.clone();
    nuevaX.x += movimiento.x;
    if (!verificarColisiones(nuevaX)) {
        controls.getObject().position.x = nuevaX.x;
    }

    const nuevaZ = controls.getObject().position.clone();
    nuevaZ.z += movimiento.z;
    if (!verificarColisiones(nuevaZ)) {
        controls.getObject().position.z = nuevaZ.z;
    }

    // Movimiento vertical (gravedad)
    velocidadY -= gravedad * delta * 60;
    const nuevaY = controls.getObject().position.y + velocidadY;

    const posYPrueba = controls.getObject().position.clone();
    posYPrueba.y = nuevaY;

    if (!verificarColisiones(posYPrueba)) {
        controls.getObject().position.y = nuevaY;
        personajeEnSuelo = false;
    } else {
        if (velocidadY < 0) {
            personajeEnSuelo = true;
        }
        velocidadY = 0;
    }
}
function updateVillainBehavior(delta) {
    if (!villainModel || villainIsDead || playerIsDead) return;

    const distancia = controls.getObject().position.distanceTo(villainModel.position);

    // Solo hace Taunt la primera vez que entra en rango
    if (!villainHasTaunted && distancia < 8) {
        villainHasTaunted = true;
        setVillainAnimation(VILLAIN_STATES.TAUNT);

        // Espera a que termine la animación antes de continuar comportamiento normal
        setTimeout(() => {
            if (!villainIsDead) {
                updateVillainBehavior(delta); // Llama otra vez para retomar lógica normal
            }
        }, villainAnimations[VILLAIN_STATES.TAUNT].duration * 1000);

        return;
    }

    // Lógica normal después del taunt
    if (distancia > 6) {
        setVillainAnimation(VILLAIN_STATES.FAST_RUN);
    } else if (distancia > 2) {
        setVillainAnimation(VILLAIN_STATES.WALKING);
    } else {
        setVillainAnimation(VILLAIN_STATES.PUNCHING_BAG);
        intentarAtacarJugador();
    }
}



function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    moverPersonaje(delta);
    updateVillainBehavior(delta);
    moverVillanoHaciaJugador(delta);
    intentarAtacarJugador();
    if (mixer) mixer.update(delta);
    if (villainMixer) villainMixer.update(delta);

    // Verificar estado del villano
    checkVillainDeath();
    checkPlayerWin();

    renderer.render(scene, camera);
}

// Iniciar la aplicación
window.addEventListener('load', () => {
    init();
    animate();
});