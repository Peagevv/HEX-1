// Constantes del juego
const GAME_CONSTANTS = {
    PLAYER: {
        BASE_SPEED: 0.1,
        RUN_SPEED: 0.2,
        JUMP_FORCE: 0.11,
        GRAVITY: 0.002,
        JUMP_DELAY: 500,
        HEALTH: 100,
        HEIGHT: 0.8
    },
    VILLAIN: {
        BASE_SPEED: 0.02,
        RUN_SPEED: 0.05,
        DETECTION_RADIUS: 8,
        ATTACK_RADIUS: 2,
        ATTACK_COOLDOWN: 1000,
        HEALTH: 100,
        DAMAGE: 10
    },
    ATTACK: {
        DAMAGE: 20,
        COOLDOWN: 2000
    },
    COLORS: {
        BACKGROUND: 0x87CEEB,
        FOG: [0x87CEEB, 10, 150],
        HEALTH: {
            PLAYER: {
                HIGH: '#00ff00',
                MEDIUM: '#ffff00',
                LOW: '#ff0000'
            },
            ENEMY: {
                HIGH: '#ff0000',
                MEDIUM: '#cc0000',
                LOW: '#990000'
            }
        }
    }
};


// Estados del villano
const VILLAIN_STATES = {
    WALKING: 'Walking',
    PUNCHING_BAG: 'Punching_Bag',
    FAST_RUN: 'Fast_Run',
    BRUTAL_ASSASSINATION: 'Brutal_Assassination',
    EXCITED: 'Excited',
    RECEIVE_HIT: 'Receive_Uppercut_To_The_Face',

};


// Variables globales
let scene, camera, renderer, controls, clock, mixer, villainMixer;
let modeloEscenario, villainModel;
let currentVillainAction = null;
const objetosColision = [];
let teclas = {};
let villainHealth = GAME_CONSTANTS.VILLAIN.HEALTH;
let villainIsDead = false;
let gameWon = false;
let playerHealth = GAME_CONSTANTS.PLAYER.HEALTH;
let playerIsDead = false;
let lastAttackTime = 0;


let velocidadActual = GAME_CONSTANTS.PLAYER.BASE_SPEED;
let puedeSaltar = true;
let velocidadY = 0;
let personajeEnSuelo = false;
let tiempoUltimoSalto = 0;
let villainState = VILLAIN_STATES.WALKING;
let villainAnimations = {};

// Configuración inicial
function init() {
    // Crear escena
    scene = new THREE.Scene();
    scene.background = new THREE.Color(GAME_CONSTANTS.COLORS.BACKGROUND);
    scene.fog = new THREE.Fog(...GAME_CONSTANTS.COLORS.FOG);
    clock = new THREE.Clock();

    // Configurar cámara
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.y = GAME_CONSTANTS.PLAYER.HEIGHT;

    // Configurar renderizador
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    document.body.appendChild(renderer.domElement);

    // Controles FPS
    controls = new THREE.PointerLockControls(camera, document.body);
    scene.add(controls.getObject());

    // Eventos del ratón
    document.addEventListener('mousedown', (event) => {
        if (event.button === 2 && !villainIsDead) { // Clic derecho
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

    // Configurar luces
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 1);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    scene.add(directionalLight);

    // Cargar modelo del escenario
    const loader = new THREE.GLTFLoader();
    loader.load(
        'models/free_low_poly_game_assets.glb',
        (gltf) => {
            modeloEscenario = gltf.scene;
            modeloEscenario.position.set(8, -8, 0);
            modeloEscenario.scale.set(1, 1, 1);

            // Configurar sombras y colisiones
            modeloEscenario.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;

                    if (!child.name.includes('decor') && !child.name.includes('planta')) {
                        objetosColision.push(child);
                    }
                }
            });

            // Configurar animaciones
            if (gltf.animations?.length) {
                mixer = new THREE.AnimationMixer(modeloEscenario);
                gltf.animations.forEach((clip) => {
                    mixer.clipAction(clip).play();
                });
            }

            scene.add(modeloEscenario);
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

        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            velocidadActual = GAME_CONSTANTS.PLAYER.RUN_SPEED;
        }

        if (event.code === 'Space' && personajeEnSuelo && Date.now() - tiempoUltimoSalto > GAME_CONSTANTS.PLAYER.JUMP_DELAY) {
            velocidadY = GAME_CONSTANTS.PLAYER.JUMP_FORCE;
            personajeEnSuelo = false;
            tiempoUltimoSalto = Date.now();
        }
    });

    document.addEventListener('keyup', (event) => {
        teclas[event.code] = false;

        if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
            velocidadActual = GAME_CONSTANTS.PLAYER.BASE_SPEED;
        }
    });

    // Manejar redimensionamiento
    window.addEventListener('resize', onWindowResize);
    
    // Inicializar salud
    updateHealthDisplays();
}

// Actualizar displays de salud
function updateHealthDisplays() {
    // Jugador
    const playerHealthPercent = (playerHealth / GAME_CONSTANTS.PLAYER.HEALTH) * 100;
    const playerHealthBar = document.getElementById("playerHealthBar");
    const playerHealthText = document.getElementById("playerHealthText");
    
    playerHealthBar.style.width = `${playerHealthPercent}%`;
    playerHealthText.textContent = `${playerHealth}/${GAME_CONSTANTS.PLAYER.HEALTH}`;
    
    if (playerHealthPercent > 60) {
        playerHealthBar.style.backgroundColor = GAME_CONSTANTS.COLORS.HEALTH.PLAYER.HIGH;
    } else if (playerHealthPercent > 30) {
        playerHealthBar.style.backgroundColor = GAME_CONSTANTS.COLORS.HEALTH.PLAYER.MEDIUM;
    } else {
        playerHealthBar.style.backgroundColor = GAME_CONSTANTS.COLORS.HEALTH.PLAYER.LOW;
    }

    // Enemigo
    const enemyHealthPercent = (villainHealth / GAME_CONSTANTS.VILLAIN.HEALTH) * 100;
    const enemyHealthBar = document.getElementById("enemyHealthBar");
    const enemyHealthText = document.getElementById("enemyHealthText");
    
    enemyHealthBar.style.width = `${enemyHealthPercent}%`;
    enemyHealthText.textContent = `${villainHealth}/${GAME_CONSTANTS.VILLAIN.HEALTH}`;
    
    if (enemyHealthPercent > 60) {
        enemyHealthBar.style.backgroundColor = GAME_CONSTANTS.COLORS.HEALTH.ENEMY.HIGH;
    } else if (enemyHealthPercent > 30) {
        enemyHealthBar.style.backgroundColor = GAME_CONSTANTS.COLORS.HEALTH.ENEMY.MEDIUM;
    } else {
        enemyHealthBar.style.backgroundColor = GAME_CONSTANTS.COLORS.HEALTH.ENEMY.LOW;
    }
}

// Game Over
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
    screen.style.flexDirection = "column";
    screen.style.justifyContent = "center";
    screen.style.alignItems = "center";
    screen.style.color = "white";
    screen.style.fontSize = "48px";
    screen.style.zIndex = "9999";
    
    const message = document.createElement("div");
    message.textContent = victory ? "¡Has ganado!" : "¡Has muerto!";
    
    const restartButton = document.createElement("button");
    restartButton.textContent = "Reiniciar Juego";
    restartButton.style.marginTop = "20px";
    restartButton.style.padding = "10px 20px";
    restartButton.style.fontSize = "24px";
    restartButton.style.cursor = "pointer";
    restartButton.addEventListener("click", () => location.reload());
    
    screen.appendChild(message);
    screen.appendChild(restartButton);
    document.body.appendChild(screen);
}

// Funciones de daño
function damageEnemy(amount) {
    villainHealth = Math.max(0, villainHealth - amount);
    updateHealthDisplays();
    
    if (villainHealth <= 0) {
        villainIsDead = true;
        setVillainAnimation(VILLAIN_STATES.BRUTAL_ASSASSINATION);
        showGameOverScreen(true);
    }
}

function damagePlayer(amount) {
    playerHealth = Math.max(0, playerHealth - amount);
    updateHealthDisplays();
    
    if (playerHealth <= 0) {
        playerIsDead = true;
        setVillainAnimation(VILLAIN_STATES.EXCITED);
        showGameOverScreen(false);
    }
}

// Cargar modelo del villano
function loadVillainModel() {
    const fbxLoader = new THREE.FBXLoader();

    fbxLoader.load(
        'models/amy/Walking.fbx',
        (fbx) => {
            villainModel = fbx;
            villainModel.scale.set(0.01, 0.01, 0.01);
            villainModel.position.set(5, -8, 5);

            villainModel.traverse((child) => {
                if (child.isMesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });

            scene.add(villainModel);
            loadVillainAnimations();
        },
        undefined,
        (error) => {
            console.error('Error al cargar el modelo del villano:', error);
        }
    );
}

// Cargar animaciones del villano
function loadVillainAnimations() {
    const fbxLoader = new THREE.FBXLoader();
    const animationFiles = [
        { name: VILLAIN_STATES.WALKING, file: 'models/amy/Walking.fbx' },
        { name: VILLAIN_STATES.PUNCHING_BAG, file: 'models/amy/Punching_Bag.fbx' },
        { name: VILLAIN_STATES.FAST_RUN, file: 'models/amy/Fast_Run.fbx' },
        { name: VILLAIN_STATES.BRUTAL_ASSASSINATION, file: 'models/amy/Brutal_Assassination.fbx' },
        { name: VILLAIN_STATES.EXCITED, file: 'models/amy/Excited.fbx' },
        { name: VILLAIN_STATES.RECEIVE_HIT, file: 'models/amy/Receive_Uppercut_To_The_Face.fbx' },
       
    ];

    let loadedCount = 0;

    animationFiles.forEach((anim) => {
        fbxLoader.load(
            anim.file,
            (animation) => {
                villainAnimations[anim.name] = animation.animations[0];
                loadedCount++;

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

// Configurar animaciones del villano
function setupVillainAnimations() {
    villainMixer = new THREE.AnimationMixer(villainModel);

    for (const [name, clip] of Object.entries(villainAnimations)) {
        const action = villainMixer.clipAction(clip);
        action.name = name;

        if (name === VILLAIN_STATES.WALKING) {
            action.play();
        }
    }

    setVillainAnimation(VILLAIN_STATES.WALKING);
}

// Cambiar animación del villano
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

// Verificar ataque al enemigo
function checkAttackHit() {
    if (villainIsDead || Date.now() - lastAttackTime < GAME_CONSTANTS.ATTACK.COOLDOWN) return;
    
    lastAttackTime = Date.now();
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(), camera);

    if (raycaster.intersectObject(villainModel, true).length > 0) {
        damageEnemy(GAME_CONSTANTS.ATTACK.DAMAGE);
        setVillainAnimation(VILLAIN_STATES.RECEIVE_HIT);
        
        setTimeout(() => {
            if (!villainIsDead) {
                setVillainAnimation(VILLAIN_STATES.WALKING);
            }
        }, 4000);
    }
}

// Comportamiento del villano
function updateVillainBehavior(delta) {
    if (!villainModel || villainIsDead || playerIsDead) return;

    const distancia = controls.getObject().position.distanceTo(villainModel.position);

    // Eliminado todo el bloque de TAUNT
    if (distancia > 6) {
        setVillainAnimation(VILLAIN_STATES.FAST_RUN);
    } else if (distancia > 2) {
        setVillainAnimation(VILLAIN_STATES.WALKING);
    } else {
        setVillainAnimation(VILLAIN_STATES.PUNCHING_BAG);
        intentarAtacarJugador();
    }
}

// Ataque del villano
function intentarAtacarJugador() {
    if (villainIsDead || playerIsDead) return;

    const ahora = Date.now();
    const distancia = villainModel.position.distanceTo(controls.getObject().position);

    if (distancia < GAME_CONSTANTS.VILLAIN.ATTACK_RADIUS && 
        (ahora - lastAttackTime > GAME_CONSTANTS.VILLAIN.ATTACK_COOLDOWN)) {
        lastAttackTime = ahora;
        setVillainAnimation(VILLAIN_STATES.BRUTAL_ASSASSINATION);
        damagePlayer(GAME_CONSTANTS.VILLAIN.DAMAGE);
    }
}

// Movimiento del villano
function moverVillanoHaciaJugador(delta) {
    if (!villainModel || villainIsDead) return;

    const jugadorPos = controls.getObject().position.clone();
    const villanoPos = villainModel.position.clone();
    const direccion = jugadorPos.sub(villanoPos);
    direccion.y = 0;

    const distancia = direccion.length();

    if (distancia > 0.5) {
        direccion.normalize();

        let velocidadVillano = GAME_CONSTANTS.VILLAIN.BASE_SPEED;
        if (villainState === VILLAIN_STATES.FAST_RUN) {
            velocidadVillano = GAME_CONSTANTS.VILLAIN.RUN_SPEED;
        }

        direccion.multiplyScalar(velocidadVillano * delta * 60);
        villainModel.position.add(direccion);
        villainModel.lookAt(controls.getObject().position.clone().setY(villainModel.position.y));
    }
}

// Movimiento del jugador
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
    velocidadY -= GAME_CONSTANTS.PLAYER.GRAVITY * delta * 60;
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

// Verificar colisiones
function verificarColisiones(posicion) {
    const cajaPersonaje = new THREE.Box3().setFromCenterAndSize(
        new THREE.Vector3(posicion.x, posicion.y - 0.3, posicion.z),
        new THREE.Vector3(0.1, 0.8, 0.1)
    );

    for (const objeto of objetosColision) {
        const cajaObjeto = new THREE.Box3().expandByObject(objeto);
        if (cajaPersonaje.intersectsBox(cajaObjeto)) {
            return true;
        }
    }
    return false;
}

// Redimensionamiento
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// Bucle de animación
function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    
    moverPersonaje(delta);
    updateVillainBehavior(delta);
    moverVillanoHaciaJugador(delta);
    
    if (mixer) mixer.update(delta);
    if (villainMixer) villainMixer.update(delta);
    
    renderer.render(scene, camera);
}

// Iniciar juego
window.addEventListener('load', () => {
    init();
    animate();
});