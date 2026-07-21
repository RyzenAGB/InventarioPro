// ============================================================
//  ProAlmacén  auth.js (pantalla de login)
// ============================================================

window.addEventListener('DOMContentLoaded', async () => {
  // Verificar si ya hay sesión activa
  try {
    const { ok } = await api('GET', '/api/auth/me');
    if (ok) {
      window.location.replace('/dashboard.html');
    }
  } catch(e) {}
});

function switchTab(tab) {
  document.querySelectorAll('.auth-tab, .auth-panel').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('panel-' + tab).classList.add('active');
}

function seleccionarTipo(tipo) {
  document.querySelectorAll('.tipo-opt').forEach(el => el.classList.remove('selected'));
  document.getElementById('opt-' + tipo).classList.add('selected');
  document.querySelectorAll('.registro-form').forEach(f => f.style.display = 'none');
  document.getElementById('form-' + tipo).style.display = 'flex';
}

function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = icon('eye-off');
  } else {
    input.type = 'password';
    btn.innerHTML = icon('eye');
  }
}

// ── Login ─────────────────────────────────────────────────
document.getElementById('form-login').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarError('err-login-general');

  const correo    = document.getElementById('login-correo').value.trim();
  const contrasena = document.getElementById('login-contrasena').value;

  if (!correo || !contrasena) {
    mostrarError('err-login-general', 'Completa todos los campos.');
    return;
  }

  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Ingresando';

  const { ok, data } = await api('POST', '/api/auth/login', { correo, contrasena });

  btn.disabled = false;
  btn.textContent = 'Iniciar sesión';

  if (ok) {
    toast('¡Bienvenido, ' + data.usuario.nombre_completo + '!', 'success');
    setTimeout(() => { window.location.replace('/dashboard.html'); }, 700);
  } else {
    mostrarError('err-login-general', data.mensaje || 'Credenciales incorrectas');
  }
});

// ── Registro  Crear empresa ──────────────────────────────
document.getElementById('form-nueva').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarError('err-reg-nueva');

  const body = {
    nombre_empresa:  document.getElementById('reg-empresa').value.trim(),
    nombre_almacen:  document.getElementById('reg-almacen').value.trim(),
    nombre_completo: document.getElementById('reg-nombre').value.trim(),
    correo:          document.getElementById('reg-correo').value.trim(),
    contrasena:      document.getElementById('reg-pass').value,
  };

  if (!body.nombre_empresa || !body.nombre_almacen || !body.nombre_completo || !body.correo || !body.contrasena) {
    mostrarError('err-reg-nueva', 'Todos los campos son obligatorios.');
    return;
  }

  const btn = document.getElementById('btn-reg-nueva');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creando empresa…';

  const { ok, data } = await api('POST', '/api/auth/registro', body);

  btn.disabled = false;
  btn.textContent = 'Crear empresa';

  if (ok) {
    document.getElementById('registro-formularios').style.display = 'none';
    document.getElementById('codigo-empresa-texto').textContent = data.codigo_empresa;
    document.getElementById('registro-exito').style.display = 'flex';
  } else {
    mostrarError('err-reg-nueva', data.mensaje || 'Error al crear la empresa.');
  }
});

// ── Registro  Unirse a empresa ───────────────────────────
document.getElementById('form-unirse').addEventListener('submit', async (e) => {
  e.preventDefault();
  limpiarError('err-reg-unirse');

  const body = {
    codigo_empresa:  document.getElementById('unirse-codigo').value.trim().toUpperCase(),
    nombre_completo: document.getElementById('unirse-nombre').value.trim(),
    correo:          document.getElementById('unirse-correo').value.trim(),
    contrasena:      document.getElementById('unirse-pass').value,
  };

  if (!body.codigo_empresa || !body.nombre_completo || !body.correo || !body.contrasena) {
    mostrarError('err-reg-unirse', 'Todos los campos son obligatorios.');
    return;
  }

  const btn = document.getElementById('btn-reg-unirse');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Uniéndome';

  const { ok, data } = await api('POST', '/api/auth/unirse', body);

  btn.disabled = false;
  btn.textContent = 'Unirme al almacén';

  if (ok) {
    toast('¡Cuenta creada! Ahora inicia sesión.', 'success', 4000);
    setTimeout(() => switchTab('login'), 1200);
  } else {
    mostrarError('err-reg-unirse', data.mensaje || 'Error al unirse.');
  }
});

function copiarCodigo() {
  const codigo = document.getElementById('codigo-empresa-texto').textContent;
  copiarTexto(codigo);
}
