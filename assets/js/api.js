/**
 * Handles all communication with the backend API.
 */

// Generic POST request handler
export async function postRequest(formData) {
    const response = await fetch(`${App.url}/api.php`, { method: 'POST', body: formData });
    
    let result;
    try {
        result = await response.json();
    } catch (e) {
        if (!response.ok) throw new Error('Network response was not ok.');
        throw new Error('Invalid JSON response from server.');
    }

    if (result && result.status !== 'success') {
        throw new Error(result.message || 'Unknown server error.');
    }

    if (!response.ok) {
        throw new Error('Network response was not ok.');
    }

    return result;
}

export async function fetchContentForPath(path) {
    if (path === '[Error Log]') {
        const response = await fetch(`${App.url}/api.php?action=get_log_content`);
        if (!response.ok) throw new Error('Network response was not ok.');
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        const content = result.data.content.split('\n').reverse().join('\n');
        return { content, mode: 'ace/mode/text', isReadOnly: true };
    } else {
        const response = await fetch(`${App.url}/api.php?action=get_file_content&path=${encodeURIComponent(path)}`);
        if (!response.ok) throw new Error('Network response was not ok.');
        const result = await response.json();
        if (result.status !== 'success') throw new Error(result.message);
        const modelist = ace.require("ace/ext/modelist");
        const mode = modelist.getModeForPath(path).mode;
        return { content: result.data.content, mode, isReadOnly: false };
    }
}
